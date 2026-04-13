from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

try:
    from .generation_backend import GenerationError, GenerationRequest, get_generation_backend
    from .diagram_project import (
        analyze_diagram_payload,
        add_diagram_element,
        apply_element_update,
        apply_prompt_to_diagram_model,
        build_diagram_from_prompt,
        diagram_model_to_structured_data,
        render_diagram_model,
        refresh_diagram_metadata,
    )
    from .editing_models import DiagramModel
    from .precision_editing import analyze_edit_request, perform_precise_edit
    from .session_store import (
        FileSessionStore,
        HistoryVersionNotFoundError,
        InvalidImageError,
        SessionNotFoundError,
        UndoNotAvailableError,
    )
    from .workflow_profiles import resolve_workflow_profile as resolve_profile_config
except ImportError:
    from generation_backend import GenerationError, GenerationRequest, get_generation_backend
    from diagram_project import (
        analyze_diagram_payload,
        add_diagram_element,
        apply_element_update,
        apply_prompt_to_diagram_model,
        build_diagram_from_prompt,
        diagram_model_to_structured_data,
        render_diagram_model,
        refresh_diagram_metadata,
    )
    from editing_models import DiagramModel
    from precision_editing import analyze_edit_request, perform_precise_edit
    from session_store import (
        FileSessionStore,
        HistoryVersionNotFoundError,
        InvalidImageError,
        SessionNotFoundError,
        UndoNotAvailableError,
    )
    from workflow_profiles import resolve_workflow_profile as resolve_profile_config


load_dotenv()

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

active_connections = 0
DEFAULT_STORAGE_DIR = Path(
    os.getenv("SESSION_STORAGE_DIR", Path(__file__).resolve().parent / "data" / "sessions")
)


class UndoRequest(BaseModel):
    session_id: str


class RevertRequest(BaseModel):
    session_id: str
    version: int


class DiagramElementEditRequest(BaseModel):
    session_id: str
    element_id: str
    label: Optional[str] = None
    fill_color: Optional[str] = None
    stroke_color: Optional[str] = None
    text_color: Optional[str] = None
    x: Optional[int] = None
    y: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    source_id: Optional[str] = None
    target_id: Optional[str] = None
    semantic_class: Optional[str] = None
    delete: bool = False


class DiagramElementCreateRequest(BaseModel):
    session_id: str
    element_type: str
    label: str = ""
    x: int = 120
    y: int = 120
    width: int = 180
    height: int = 84
    fill_color: str = "#ffffff"
    stroke_color: str = "#1f2b24"
    text_color: str = "#1f2b24"
    source_id: Optional[str] = None
    target_id: Optional[str] = None
    semantic_class: str = "generic"


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting editable image API")
    yield
    log.info("Shutting down editable image API")


def _clean_prompt(prompt_text: str) -> str:
    prompt = prompt_text.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt_text cannot be empty.")
    return prompt


def _server_url() -> str:
    server_url = os.getenv("SERVER_URL")
    if not server_url:
        raise HTTPException(
            status_code=500,
            detail="SERVER_URL is not configured. Point it at your ComfyUI server first.",
        )
    return server_url


def _generation_backend():
    return get_generation_backend(_server_url())


def _build_generation_parameters(
    *,
    model_name: str,
    seed: Optional[int],
    steps: int,
    cfg: float,
    sampler: str,
    scheduler: str,
    denoise: Optional[float] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
) -> dict[str, object]:
    parameters: dict[str, object] = {
        "model_name": model_name,
        "seed": seed,
        "steps": steps,
        "cfg": cfg,
        "sampler": sampler,
        "scheduler": scheduler,
    }
    if denoise is not None:
        parameters["denoise"] = denoise
    if width is not None:
        parameters["width"] = width
    if height is not None:
        parameters["height"] = height
    return parameters


def _configured_model_name() -> Optional[str]:
    configured_model = os.getenv("MODEL")
    if configured_model:
        configured_model = configured_model.strip()
    return configured_model or None


def _prefers_fast_edit_path(model_name: Optional[str], workflow_profile: Optional[str]) -> bool:
    model_value = (model_name or "").strip().lower()
    profile_value = (workflow_profile or "").strip().lower()
    return "flux" in model_value or profile_value == "flux"


def _resolve_generation_tuning(
    *,
    task_type: str,
    model_name: str,
    workflow_profile: Optional[str],
    width: Optional[int] = None,
    height: Optional[int] = None,
    steps: Optional[int] = None,
    cfg: Optional[float] = None,
    sampler: Optional[str] = None,
    scheduler: Optional[str] = None,
    denoise: Optional[float] = None,
) -> dict[str, object]:
    profile = resolve_profile_config(task_type, model_name=model_name, explicit_profile=workflow_profile)
    return {
        "workflow_profile": profile.name,
        "width": width if width is not None else profile.recommended_width,
        "height": height if height is not None else profile.recommended_height,
        "steps": steps if steps is not None else profile.recommended_steps,
        "cfg": cfg if cfg is not None else profile.recommended_cfg,
        "sampler": sampler or profile.recommended_sampler,
        "scheduler": scheduler or profile.recommended_scheduler,
        "denoise": 0.6 if denoise is None else denoise,
    }


def _session_image_url(session_id: str, filename: str) -> str:
    return f"/api/sessions/{session_id}/images/{filename}"


def _current_entry_parameters(session: dict) -> dict:
    return session["edit_history"][session["current_index"]].get("parameters", {})


def _merge_operation_metadata(
    parameters: dict[str, object],
    *,
    content_mode: str = "image",
    edit_intent: Optional[dict] = None,
    region_selection: Optional[dict] = None,
    diagram_model: Optional[dict] = None,
    diagram_xml: Optional[str] = None,
    mode_state: Optional[dict] = None,
    mask_metadata: Optional[dict] = None,
    model_routing: Optional[list[dict]] = None,
    warnings: Optional[list[str]] = None,
) -> dict[str, object]:
    merged = dict(parameters)
    merged["content_mode"] = content_mode
    if edit_intent is not None:
        merged["edit_intent"] = edit_intent
    if region_selection is not None:
        merged["region_selection"] = region_selection
    if diagram_model is not None:
        merged["diagram_model"] = diagram_model
    if diagram_xml is not None:
        merged["diagram_xml"] = diagram_xml
    if mode_state is not None:
        merged["mode_state"] = mode_state
    if mask_metadata is not None:
        merged["mask_metadata"] = mask_metadata
    if model_routing is not None:
        merged["model_routing"] = model_routing
    if warnings is not None:
        merged["warnings"] = warnings
    return merged


def _serialize_session(request: Request, session: dict) -> dict:
    history = []
    for entry in session["edit_history"]:
        history.append(
            {
                **entry,
                "image_url": _session_image_url(session["session_id"], entry["image_filename"]),
                "is_current": entry["version"] == session["current_index"],
            }
        )

    current_entry = history[session["current_index"]]
    current_parameters = current_entry.get("parameters", {})
    current_diagram_payload = current_parameters.get("diagram_model")
    current_diagram_structure = None
    if current_diagram_payload:
        current_diagram_structure = diagram_model_to_structured_data(DiagramModel.from_dict(current_diagram_payload))
    return {
        "session_id": session["session_id"],
        "created_at": session["created_at"],
        "updated_at": session["updated_at"],
        "current_index": session["current_index"],
        "can_undo": session["current_index"] > 0,
        "can_revert": len(session["edit_history"]) > 1,
        "content_mode": current_parameters.get("content_mode", "image"),
        "current_edit_intent": current_parameters.get("edit_intent"),
        "current_region_selection": current_parameters.get("region_selection"),
        "current_diagram_model": current_parameters.get("diagram_model"),
        "current_diagram_structure": current_diagram_structure,
        "current_diagram_xml": current_parameters.get("diagram_xml"),
        "current_mode_state": current_parameters.get("mode_state"),
        "current_mask_metadata": current_parameters.get("mask_metadata"),
        "current_model_routing": current_parameters.get("model_routing", []),
        "analysis_warnings": current_parameters.get("warnings", []),
        "current_model": current_entry.get("parameters", {}).get("model_name"),
        "original_image_url": _session_image_url(session["session_id"], session["original_image"]),
        "current_image_url": _session_image_url(session["session_id"], session["current_image"]),
        "current_entry": current_entry,
        "edit_history": history,
    }


def _analysis_operation_metadata(analysis) -> dict[str, object]:
    payload = analysis.to_dict()
    diagram_model = analysis.diagram_model
    return {
        "content_mode": payload.get("content_mode", "image"),
        "edit_intent": payload.get("edit_intent"),
        "region_selection": payload.get("region_selection"),
        "diagram_model": payload.get("diagram_model"),
        "diagram_xml": diagram_model.xml_representation if diagram_model else None,
        "mode_state": payload.get("mode_state"),
        "mask_metadata": payload.get("mask_metadata"),
        "model_routing": [decision.to_dict() for decision in diagram_model.routing_metadata]
        if diagram_model
        else None,
        "warnings": payload.get("warnings", []),
    }


def _initial_upload_metadata() -> dict[str, object]:
    return _merge_operation_metadata(
        {},
        content_mode="image",
        region_selection={
            "regions": [],
            "confidence": 1.0,
            "mask_type": "full",
            "affected_element_ids": [],
            "rationale": "Preserved the original uploaded image as the base history version.",
        },
        mask_metadata={
            "used": False,
            "source": "upload",
            "mask_type": "full",
            "regions": [],
            "coverage_ratio": 0.0,
            "width": 0,
            "height": 0,
            "mask_image_filename": None,
            "mask_image_url": None,
        },
        warnings=["The original uploaded image is stored as history version 0 for non-destructive reverts."],
    )


def _attach_mask_asset(application: FastAPI, session: dict, mask_bytes: Optional[bytes]) -> dict:
    if not mask_bytes:
        return session

    current_entry = session["edit_history"][session["current_index"]]
    mask_filename = application.state.session_store.write_entry_image_asset(
        session["session_id"],
        current_entry["version"],
        suffix="mask",
        image_bytes=mask_bytes,
    )
    mask_metadata = dict(current_entry.get("parameters", {}).get("mask_metadata") or {})
    if not mask_metadata:
        return session

    mask_metadata["mask_image_filename"] = mask_filename
    mask_metadata["mask_image_url"] = _session_image_url(session["session_id"], mask_filename)
    return application.state.session_store.update_entry_parameters(
        session["session_id"],
        current_entry["version"],
        {"mask_metadata": mask_metadata},
    )


def create_app(session_store: Optional[FileSessionStore] = None) -> FastAPI:
    application = FastAPI(lifespan=lifespan, title="Editable AI Image API")
    application.state.session_store = session_store or FileSessionStore(DEFAULT_STORAGE_DIR)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.middleware("http")
    async def track_connections(request: Request, call_next):
        global active_connections
        active_connections += 1
        log.debug("Incoming %s %s | active=%s", request.method, request.url.path, active_connections)
        try:
            return await call_next(request)
        finally:
            active_connections = max(0, active_connections - 1)
            log.debug("Finished %s %s | active=%s", request.method, request.url.path, active_connections)

    @application.get("/health")
    @application.get("/api/health")
    async def health():
        return {
            "status": "ok",
            "active_connections": active_connections,
            "storage_dir": str(application.state.session_store.root_dir),
        }

    @application.get("/models")
    @application.get("/api/models")
    async def models():
        backend = _generation_backend()
        configured_model = _configured_model_name()

        try:
            available_models = await run_in_threadpool(backend.list_models)
            model_catalog = await run_in_threadpool(backend.list_model_catalog)
            workflow_profiles = await run_in_threadpool(backend.list_workflow_profiles)
        except GenerationError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        default_model = (
            configured_model
            if configured_model and configured_model in available_models
            else (available_models[0] if available_models else configured_model)
        )

        return {
            "models": available_models,
            "catalog": model_catalog,
            "backend": backend.provider_name,
            "workflow_profiles": workflow_profiles,
            "configured_model": configured_model,
            "configured_model_available": configured_model in available_models
            if configured_model
            else False,
            "default_model": default_model,
            "task_defaults": {
                "text_to_image": backend.resolve_model(None, "text_to_image") if available_models else configured_model,
                "image_edit": backend.resolve_model(None, "image_edit") if available_models else configured_model,
                "diagram_cleanup": backend.resolve_model(None, "diagram_cleanup") if available_models else configured_model,
                "asset_refine": backend.resolve_model(None, "asset_refine") if available_models else configured_model,
            },
            "workflow_defaults": {
                "text_to_image": backend.resolve_workflow_profile(None, configured_model, "text_to_image"),
                "image_edit": backend.resolve_workflow_profile(None, configured_model, "image_edit"),
                "diagram_cleanup": backend.resolve_workflow_profile(None, configured_model, "diagram_cleanup"),
                "asset_refine": backend.resolve_workflow_profile(None, configured_model, "asset_refine"),
            },
        }

    @application.post("/generate")
    @application.post("/api/generate")
    async def generate(
        request: Request,
        prompt_text: str = Form(...),
        model_name: Optional[str] = Form(None),
        workflow_profile: Optional[str] = Form(None),
        mode_override: Optional[str] = Form(None),
        seed: Optional[int] = Form(None),
        steps: Optional[int] = Form(None),
        cfg: Optional[float] = Form(None),
        sampler: Optional[str] = Form(None),
        scheduler: Optional[str] = Form(None),
        width: Optional[int] = Form(None),
        height: Optional[int] = Form(None),
    ):
        prompt = _clean_prompt(prompt_text)

        try:
            if mode_override == "diagram":
                diagram_width = width or 1024
                diagram_height = height or 720
                diagram_steps = steps or 20
                diagram_cfg = cfg or 8.0
                diagram_sampler = sampler or "euler"
                diagram_scheduler = scheduler or "normal"
                diagram_model = await run_in_threadpool(build_diagram_from_prompt, prompt, diagram_width, diagram_height)
                generated_bytes = await run_in_threadpool(render_diagram_model, diagram_model)
                parameters = _merge_operation_metadata(
                    _build_generation_parameters(
                        model_name=model_name or "diagram-canvas",
                        seed=seed,
                        steps=diagram_steps,
                        cfg=diagram_cfg,
                        sampler=diagram_sampler,
                        scheduler=diagram_scheduler,
                        width=diagram_width,
                        height=diagram_height,
                    ),
                    content_mode="diagram",
                    diagram_model=diagram_model.to_dict(),
                    diagram_xml=diagram_model.xml_representation,
                    mode_state=diagram_model.mode_state.to_dict() if diagram_model.mode_state else None,
                    model_routing=[entry.to_dict() for entry in diagram_model.routing_metadata],
                    warnings=diagram_model.notes,
                )
                operation = "diagram_generate"
            else:
                backend = _generation_backend()
                resolved_model, resolved_profile = backend.resolve_task_execution(
                    model_name,
                    workflow_profile,
                    "text_to_image",
                )
                tuning = _resolve_generation_tuning(
                    task_type="text_to_image",
                    model_name=resolved_model,
                    workflow_profile=resolved_profile,
                    width=width,
                    height=height,
                    steps=steps,
                    cfg=cfg,
                    sampler=sampler,
                    scheduler=scheduler,
                )
                generated_bytes = await run_in_threadpool(
                    backend.generate,
                    GenerationRequest(
                        prompt_text=prompt,
                        model_name=resolved_model,
                        workflow_profile=str(resolved_profile),
                        width=int(tuning["width"]),
                        height=int(tuning["height"]),
                        seed=seed,
                        steps=int(tuning["steps"]),
                        cfg=float(tuning["cfg"]),
                        sampler=str(tuning["sampler"]),
                        scheduler=str(tuning["scheduler"]),
                        task_type="text_to_image",
                    ),
                )
                parameters = _build_generation_parameters(
                    model_name=resolved_model,
                    seed=seed,
                    steps=int(tuning["steps"]),
                    cfg=float(tuning["cfg"]),
                    sampler=str(tuning["sampler"]),
                    scheduler=str(tuning["scheduler"]),
                    width=int(tuning["width"]),
                    height=int(tuning["height"]),
                )
                parameters["workflow_profile"] = str(resolved_profile)
                parameters = _merge_operation_metadata(
                    parameters,
                    content_mode="image",
                    warnings=[f"workflow_profile={resolved_profile}"],
                )
                operation = "generate"
            session = application.state.session_store.create_session(
                generated_image_bytes=generated_bytes,
                original_image_bytes=generated_bytes,
                prompt=prompt,
                operation=operation,
                source="prompt",
                parameters=parameters,
            )
            return _serialize_session(request, session)
        except GenerationError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except InvalidImageError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post("/edit")
    @application.post("/api/edit")
    async def edit(
        request: Request,
        prompt_text: str = Form(...),
        session_id: Optional[str] = Form(None),
        input_image: Optional[UploadFile] = File(None),
        mask_image: Optional[UploadFile] = File(None),
        model_name: Optional[str] = Form(None),
        workflow_profile: Optional[str] = Form(None),
        mode_override: Optional[str] = Form(None),
        seed: Optional[int] = Form(None),
        steps: Optional[int] = Form(None),
        cfg: Optional[float] = Form(None),
        sampler: Optional[str] = Form(None),
        scheduler: Optional[str] = Form(None),
        denoise: Optional[float] = Form(None),
    ):
        prompt = _clean_prompt(prompt_text)
        server_url = _server_url()
        backend = _generation_backend()

        if not session_id and input_image is None:
            raise HTTPException(
                status_code=400,
                detail="Provide either a session_id to continue editing or an input_image to start a new session.",
            )

        try:
            has_mask_upload = mask_image is not None
            task_type = (
                "diagram_cleanup"
                if mode_override == "diagram"
                else "asset_refine"
                if has_mask_upload
                else "image_edit"
            )
            requested_model = model_name
            requested_profile = workflow_profile
            if has_mask_upload and mode_override != "diagram" and _prefers_fast_edit_path(model_name, workflow_profile):
                requested_model = None
                requested_profile = None
            resolved_model, resolved_profile = backend.resolve_task_execution(
                requested_model,
                requested_profile,
                task_type,
            )
            tuning = _resolve_generation_tuning(
                task_type=task_type,
                model_name=resolved_model,
                workflow_profile=resolved_profile,
                steps=steps,
                cfg=cfg,
                sampler=sampler,
                scheduler=scheduler,
                denoise=denoise,
            )
            base_parameters = _build_generation_parameters(
                model_name=resolved_model,
                seed=seed,
                steps=int(tuning["steps"]),
                cfg=float(tuning["cfg"]),
                sampler=str(tuning["sampler"]),
                scheduler=str(tuning["scheduler"]),
                denoise=float(tuning["denoise"]),
            )
            base_parameters["workflow_profile"] = str(resolved_profile)

            if session_id and input_image is None:
                current_session = application.state.session_store.get_session(session_id)
                base_image = application.state.session_store.get_current_image_bytes(session_id)
                mask_bytes = await mask_image.read() if mask_image is not None else None
                current_diagram_payload = _current_entry_parameters(current_session).get("diagram_model")
                existing_diagram_model = (
                    DiagramModel.from_dict(current_diagram_payload) if current_diagram_payload else None
                )
                edit_result = await run_in_threadpool(
                    perform_precise_edit,
                    base_image,
                    prompt,
                    model_name=resolved_model,
                    workflow_profile=resolved_profile,
                    server_url=server_url,
                    seed=seed,
                    steps=int(tuning["steps"]),
                    cfg=float(tuning["cfg"]),
                    sampler=str(tuning["sampler"]),
                    scheduler=str(tuning["scheduler"]),
                    denoise=float(tuning["denoise"]),
                    existing_diagram_model=existing_diagram_model,
                    mode_override=mode_override,
                    mask_image_bytes=mask_bytes,
                )
                session = application.state.session_store.append_edit(
                    session_id,
                    image_bytes=edit_result.image_bytes,
                    prompt=prompt,
                    operation="diagram_edit" if edit_result.analysis.content_mode == "diagram" else "edit",
                    source="session",
                    parameters=_merge_operation_metadata(
                        base_parameters,
                        **_analysis_operation_metadata(edit_result.analysis),
                    ),
                )
                session = _attach_mask_asset(application, session, mask_bytes)
                return _serialize_session(request, session)

            uploaded_bytes = await input_image.read()
            mask_bytes = await mask_image.read() if mask_image is not None else None
            edit_result = await run_in_threadpool(
                perform_precise_edit,
                uploaded_bytes,
                prompt,
                model_name=resolved_model,
                workflow_profile=resolved_profile,
                server_url=server_url,
                filename=input_image.filename,
                seed=seed,
                steps=int(tuning["steps"]),
                cfg=float(tuning["cfg"]),
                sampler=str(tuning["sampler"]),
                scheduler=str(tuning["scheduler"]),
                denoise=float(tuning["denoise"]),
                mode_override=mode_override,
                mask_image_bytes=mask_bytes,
            )
            if edit_result.analysis.content_mode == "diagram":
                session = application.state.session_store.create_session(
                    generated_image_bytes=edit_result.image_bytes,
                    original_image_bytes=edit_result.image_bytes,
                    prompt=prompt,
                    operation="diagram_edit",
                    source="diagram_upload",
                    parameters=_merge_operation_metadata(
                        base_parameters,
                        **_analysis_operation_metadata(edit_result.analysis),
                    ),
                )
                session = _attach_mask_asset(application, session, mask_bytes)
            else:
                session = application.state.session_store.create_session(
                    generated_image_bytes=uploaded_bytes,
                    original_image_bytes=uploaded_bytes,
                    prompt=f"Imported {input_image.filename or 'uploaded image'}",
                    operation="original",
                    source="upload",
                    parameters=_initial_upload_metadata(),
                )
                session = application.state.session_store.append_edit(
                    session["session_id"],
                    image_bytes=edit_result.image_bytes,
                    prompt=prompt,
                    operation="edit",
                    source="upload",
                    parameters=_merge_operation_metadata(
                        base_parameters,
                        **_analysis_operation_metadata(edit_result.analysis),
                    ),
                )
                session = _attach_mask_asset(application, session, mask_bytes)
            return _serialize_session(request, session)
        except SessionNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except GenerationError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except InvalidImageError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post("/diagram/import")
    @application.post("/api/diagram/import")
    async def import_diagram(
        request: Request,
        diagram_file: UploadFile = File(...),
        prompt_text: Optional[str] = Form(None),
        mode_override: Optional[str] = Form("diagram"),
    ):
        payload = await diagram_file.read()
        prompt = (prompt_text or "").strip()

        try:
            try:
                backend = _generation_backend()
            except HTTPException:
                backend = None
            diagram_model = await run_in_threadpool(
                analyze_diagram_payload,
                payload,
                diagram_file.filename,
                mode_override=mode_override,
                source_image_ref=diagram_file.filename or "diagram-upload",
                generation_backend=backend,
            )
            if diagram_model is None:
                raise HTTPException(status_code=400, detail="The uploaded file was not recognized as a diagram.")

            if prompt:
                analysis = await run_in_threadpool(
                    analyze_edit_request,
                    render_diagram_model(diagram_model),
                    prompt,
                    filename=diagram_file.filename,
                    existing_diagram_model=diagram_model,
                    mode_override=mode_override,
                    server_url=os.getenv("SERVER_URL"),
                )
                updated_model, selection = await run_in_threadpool(
                    apply_prompt_to_diagram_model,
                    diagram_model,
                    analysis.edit_intent,
                )
                analysis.diagram_model = updated_model
                analysis.region_selection = selection
                rendered = render_diagram_model(updated_model)
                parameters = _merge_operation_metadata(
                    {
                        "source_format": diagram_model.source_format,
                    },
                    content_mode="diagram",
                    edit_intent=analysis.edit_intent.to_dict(),
                    region_selection=selection.to_dict(),
                    diagram_model=updated_model.to_dict(),
                    diagram_xml=updated_model.xml_representation,
                    mode_state=updated_model.mode_state.to_dict() if updated_model.mode_state else None,
                    model_routing=[entry.to_dict() for entry in updated_model.routing_metadata],
                    warnings=analysis.warnings,
                )
                stored_prompt = prompt
            else:
                rendered = render_diagram_model(diagram_model)
                parameters = _merge_operation_metadata(
                    {
                        "source_format": diagram_model.source_format,
                    },
                    content_mode="diagram",
                    region_selection={"regions": [], "confidence": 1.0, "mask_type": "element", "affected_element_ids": [], "rationale": "Imported a structured diagram without applying visual edits."},
                    diagram_model=diagram_model.to_dict(),
                    diagram_xml=diagram_model.xml_representation,
                    mode_state=diagram_model.mode_state.to_dict() if diagram_model.mode_state else None,
                    model_routing=[entry.to_dict() for entry in diagram_model.routing_metadata],
                    warnings=diagram_model.notes,
                )
                stored_prompt = f"Imported diagram from {diagram_file.filename or 'upload'}"

            session = application.state.session_store.create_session(
                generated_image_bytes=rendered,
                original_image_bytes=rendered,
                prompt=stored_prompt,
                operation="diagram_import",
                source="diagram_upload",
                parameters=parameters,
            )
            return _serialize_session(request, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post("/diagram/analyze")
    @application.post("/api/diagram/analyze")
    async def analyze_diagram(
        session_id: Optional[str] = Form(None),
        input_image: Optional[UploadFile] = File(None),
        prompt_text: str = Form("review the diagram"),
        mode_override: Optional[str] = Form(None),
    ):
        try:
            if not session_id and input_image is None:
                raise HTTPException(status_code=400, detail="Provide either a session_id or an input_image.")

            if session_id and input_image is None:
                session = application.state.session_store.get_session(session_id)
                image_bytes = application.state.session_store.get_current_image_bytes(session_id)
                current_diagram_payload = _current_entry_parameters(session).get("diagram_model")
                existing_diagram_model = (
                    DiagramModel.from_dict(current_diagram_payload) if current_diagram_payload else None
                )
                analysis = await run_in_threadpool(
                    analyze_edit_request,
                    image_bytes,
                    prompt_text,
                    existing_diagram_model=existing_diagram_model,
                    mode_override=mode_override,
                    server_url=os.getenv("SERVER_URL"),
                )
                return analysis.to_dict()

            uploaded = await input_image.read()
            analysis = await run_in_threadpool(
                analyze_edit_request,
                uploaded,
                prompt_text,
                filename=input_image.filename,
                mode_override=mode_override,
                server_url=os.getenv("SERVER_URL"),
            )
            return analysis.to_dict()
        except SessionNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post("/diagram/edit")
    @application.post("/api/diagram/edit")
    async def edit_diagram(request: Request, payload: DiagramElementEditRequest):
        try:
            session = application.state.session_store.get_session(payload.session_id)
            current_parameters = _current_entry_parameters(session)
            current_diagram_payload = current_parameters.get("diagram_model")
            if not current_diagram_payload:
                raise HTTPException(status_code=400, detail="This session does not have an editable diagram model.")

            diagram_model = DiagramModel.from_dict(current_diagram_payload)
            updated_model = await run_in_threadpool(
                apply_element_update,
                diagram_model,
                element_id=payload.element_id,
                label=payload.label,
                fill_color=payload.fill_color,
                stroke_color=payload.stroke_color,
                text_color=payload.text_color,
                x=payload.x,
                y=payload.y,
                width=payload.width,
                height=payload.height,
                source_id=payload.source_id,
                target_id=payload.target_id,
                semantic_class=payload.semantic_class,
                delete=payload.delete,
            )
            rendered = await run_in_threadpool(render_diagram_model, updated_model)

            summary_parts = [f"diagram edit on {payload.element_id}"]
            if payload.delete:
                summary_parts = [f"deleted {payload.element_id}"]
            elif payload.label is not None:
                summary_parts.append(f'label="{payload.label}"')

            updated_session = application.state.session_store.append_edit(
                payload.session_id,
                image_bytes=rendered,
                prompt=", ".join(summary_parts),
                operation="diagram_edit",
                source="diagram_editor",
                parameters=_merge_operation_metadata(
                    {
                        "source_format": updated_model.source_format,
                    },
                    content_mode="diagram",
                    region_selection={
                        "regions": [],
                        "confidence": 1.0,
                        "mask_type": "element",
                        "affected_element_ids": [payload.element_id],
                        "rationale": "Updated the selected diagram element directly.",
                    },
                    diagram_model=updated_model.to_dict(),
                    diagram_xml=updated_model.xml_representation,
                    mode_state=updated_model.mode_state.to_dict() if updated_model.mode_state else None,
                    model_routing=[entry.to_dict() for entry in updated_model.routing_metadata],
                    warnings=updated_model.notes,
                ),
            )
            return _serialize_session(request, updated_session)
        except SessionNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.post("/diagram/new")
    @application.post("/api/diagram/new")
    async def create_diagram_session(
        request: Request,
        prompt_text: str = Form("Start"),
        width: int = Form(1024),
        height: int = Form(720),
    ):
        diagram_model = await run_in_threadpool(build_diagram_from_prompt, prompt_text, width, height)
        rendered = await run_in_threadpool(render_diagram_model, diagram_model)
        session = application.state.session_store.create_session(
            generated_image_bytes=rendered,
            original_image_bytes=rendered,
            prompt=prompt_text,
            operation="diagram_generate",
            source="prompt",
            parameters=_merge_operation_metadata(
                {
                    "source_format": diagram_model.source_format,
                    "width": width,
                    "height": height,
                },
                content_mode="diagram",
                diagram_model=diagram_model.to_dict(),
                diagram_xml=diagram_model.xml_representation,
                mode_state=diagram_model.mode_state.to_dict() if diagram_model.mode_state else None,
                model_routing=[entry.to_dict() for entry in diagram_model.routing_metadata],
                warnings=diagram_model.notes,
            ),
        )
        return _serialize_session(request, session)

    @application.post("/diagram/add")
    @application.post("/api/diagram/add")
    async def add_diagram_object(request: Request, payload: DiagramElementCreateRequest):
        try:
            session = application.state.session_store.get_session(payload.session_id)
            current_parameters = _current_entry_parameters(session)
            current_diagram_payload = current_parameters.get("diagram_model")
            if not current_diagram_payload:
                raise HTTPException(status_code=400, detail="This session does not have an editable diagram model.")

            diagram_model = DiagramModel.from_dict(current_diagram_payload)
            updated_model = await run_in_threadpool(
                add_diagram_element,
                diagram_model,
                element_type=payload.element_type,
                label=payload.label,
                x=payload.x,
                y=payload.y,
                width=payload.width,
                height=payload.height,
                fill_color=payload.fill_color,
                stroke_color=payload.stroke_color,
                text_color=payload.text_color,
                source_id=payload.source_id,
                target_id=payload.target_id,
                semantic_class=payload.semantic_class,
            )
            rendered = await run_in_threadpool(render_diagram_model, updated_model)
            updated_session = application.state.session_store.append_edit(
                payload.session_id,
                image_bytes=rendered,
                prompt=f"added {payload.element_type}",
                operation="diagram_edit",
                source="diagram_editor",
                parameters=_merge_operation_metadata(
                    {
                        "source_format": updated_model.source_format,
                    },
                    content_mode="diagram",
                    region_selection={
                        "regions": [],
                        "confidence": 1.0,
                        "mask_type": "element",
                        "affected_element_ids": [],
                        "rationale": "Added a new diagram object directly in the editor.",
                    },
                    diagram_model=updated_model.to_dict(),
                    diagram_xml=updated_model.xml_representation,
                    mode_state=updated_model.mode_state.to_dict() if updated_model.mode_state else None,
                    model_routing=[entry.to_dict() for entry in updated_model.routing_metadata],
                    warnings=updated_model.notes,
                ),
            )
            return _serialize_session(request, updated_session)
        except SessionNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.get("/diagram/xml/{session_id}")
    @application.get("/api/diagram/xml/{session_id}")
    async def diagram_xml(session_id: str):
        try:
            session = application.state.session_store.get_session(session_id)
            current_parameters = _current_entry_parameters(session)
            current_diagram_payload = current_parameters.get("diagram_model")
            if not current_diagram_payload:
                raise HTTPException(status_code=400, detail="This session does not have an editable diagram model.")

            diagram_model = refresh_diagram_metadata(DiagramModel.from_dict(current_diagram_payload))
            return Response(content=diagram_model.xml_representation, media_type="application/xml")
        except SessionNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.get("/diagram/json/{session_id}")
    @application.get("/api/diagram/json/{session_id}")
    async def diagram_json(session_id: str):
        try:
            session = application.state.session_store.get_session(session_id)
            current_parameters = _current_entry_parameters(session)
            current_diagram_payload = current_parameters.get("diagram_model")
            if not current_diagram_payload:
                raise HTTPException(status_code=400, detail="This session does not have an editable diagram model.")

            diagram_model = refresh_diagram_metadata(DiagramModel.from_dict(current_diagram_payload))
            return diagram_model_to_structured_data(diagram_model)
        except SessionNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.get("/history/{session_id}")
    @application.get("/api/history/{session_id}")
    async def history(request: Request, session_id: str):
        try:
            session = application.state.session_store.get_session(session_id)
            return _serialize_session(request, session)
        except SessionNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.post("/undo")
    @application.post("/api/undo")
    async def undo(request: Request, payload: UndoRequest):
        try:
            session = application.state.session_store.undo(payload.session_id)
            return _serialize_session(request, session)
        except SessionNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except UndoNotAvailableError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post("/revert")
    @application.post("/api/revert")
    async def revert(request: Request, payload: RevertRequest):
        try:
            session = application.state.session_store.revert_to_version(
                payload.session_id,
                payload.version,
            )
            return _serialize_session(request, session)
        except SessionNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except HistoryVersionNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.get("/sessions/{session_id}/images/{filename}", name="get_session_image")
    @application.get("/api/sessions/{session_id}/images/{filename}", name="get_session_image_api")
    async def get_session_image(session_id: str, filename: str):
        try:
            image_path = application.state.session_store.get_image_path(session_id, filename)
            return FileResponse(image_path, media_type="image/png")
        except SessionNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.post("/generate/image")
    @application.post("/api/generate/image")
    async def handle_generate_image(
        prompt_text: str = Form(...),
        input_image: Optional[UploadFile] = File(None),
        model_name: Optional[str] = Form(None),
        workflow_profile: Optional[str] = Form(None),
        seed: Optional[int] = Form(None),
        steps: Optional[int] = Form(None),
        cfg: Optional[float] = Form(None),
        sampler: Optional[str] = Form(None),
        scheduler: Optional[str] = Form(None),
        denoise: Optional[float] = Form(None),
    ):
        prompt = _clean_prompt(prompt_text)
        backend = _generation_backend()

        try:
            task_type = "image_edit" if input_image is not None else "text_to_image"
            resolved_model, resolved_profile = backend.resolve_task_execution(
                model_name,
                workflow_profile,
                task_type,
            )
            tuning = _resolve_generation_tuning(
                task_type=task_type,
                model_name=resolved_model,
                workflow_profile=resolved_profile,
                steps=steps,
                cfg=cfg,
                sampler=sampler,
                scheduler=scheduler,
                denoise=denoise,
            )
            if input_image is not None:
                input_bytes = await input_image.read()
                result = await run_in_threadpool(
                    backend.edit,
                    GenerationRequest(
                        prompt_text=prompt,
                        model_name=resolved_model,
                        workflow_profile=str(resolved_profile),
                        input_image=input_bytes,
                        seed=seed,
                        steps=int(tuning["steps"]),
                        cfg=float(tuning["cfg"]),
                        sampler=str(tuning["sampler"]),
                        scheduler=str(tuning["scheduler"]),
                        denoise=float(tuning["denoise"]),
                        task_type="image_edit",
                    ),
                )
            else:
                result = await run_in_threadpool(
                    backend.generate,
                    GenerationRequest(
                        prompt_text=prompt,
                        model_name=resolved_model,
                        workflow_profile=str(resolved_profile),
                        width=int(tuning["width"]),
                        height=int(tuning["height"]),
                        seed=seed,
                        steps=int(tuning["steps"]),
                        cfg=float(tuning["cfg"]),
                        sampler=str(tuning["sampler"]),
                        scheduler=str(tuning["scheduler"]),
                        task_type="text_to_image",
                    ),
                )
            return Response(content=result, media_type="image/png")
        except GenerationError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    return application


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("API_PORT", 9988)),
        reload=os.getenv("NODE_ENV") != "production",
    )
