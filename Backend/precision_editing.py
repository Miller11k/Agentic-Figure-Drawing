from __future__ import annotations

import io
from typing import Optional

from PIL import Image, ImageDraw, ImageFilter

try:
    from .diagram_project import (
        analyze_diagram_payload,
        apply_prompt_to_diagram_model,
        refresh_diagram_metadata,
        render_diagram_model,
        select_diagram_regions,
    )
    from .editing_models import BoundingBox, DiagramModel, EditingAnalysis, PrecisionEditResult, RegionSelection, SelectedRegion
    from .generation_backend import GenerationRequest, get_generation_backend
    from .prompt_parser import parse_edit_intent
except ImportError:
    from diagram_project import (
        analyze_diagram_payload,
        apply_prompt_to_diagram_model,
        refresh_diagram_metadata,
        render_diagram_model,
        select_diagram_regions,
    )
    from editing_models import BoundingBox, DiagramModel, EditingAnalysis, PrecisionEditResult, RegionSelection, SelectedRegion
    from generation_backend import GenerationRequest, get_generation_backend
    from prompt_parser import parse_edit_intent


SEMANTIC_REGION_HINTS = {
    "sky": lambda w, h: BoundingBox(0, 0, w, max(1, int(h * 0.38))),
    "background": lambda w, h: BoundingBox(0, 0, w, h),
    "foreground": lambda w, h: BoundingBox(int(w * 0.18), int(h * 0.18), int(w * 0.64), int(h * 0.72)),
    "hat": lambda w, h: BoundingBox(int(w * 0.28), int(h * 0.04), int(w * 0.44), int(h * 0.22)),
    "hair": lambda w, h: BoundingBox(int(w * 0.22), int(h * 0.05), int(w * 0.56), int(h * 0.25)),
    "face": lambda w, h: BoundingBox(int(w * 0.24), int(h * 0.14), int(w * 0.52), int(h * 0.28)),
    "shirt": lambda w, h: BoundingBox(int(w * 0.22), int(h * 0.34), int(w * 0.56), int(h * 0.28)),
    "jacket": lambda w, h: BoundingBox(int(w * 0.18), int(h * 0.30), int(w * 0.62), int(h * 0.35)),
    "logo": lambda w, h: BoundingBox(int(w * 0.72), int(h * 0.04), int(w * 0.22), int(h * 0.18)),
    "watermark": lambda w, h: BoundingBox(int(w * 0.68), int(h * 0.76), int(w * 0.24), int(h * 0.16)),
    "text": lambda w, h: BoundingBox(int(w * 0.12), int(h * 0.08), int(w * 0.76), int(h * 0.16)),
    "label": lambda w, h: BoundingBox(int(w * 0.12), int(h * 0.08), int(w * 0.76), int(h * 0.16)),
    "ground": lambda w, h: BoundingBox(0, int(h * 0.62), w, int(h * 0.38)),
    "road": lambda w, h: BoundingBox(0, int(h * 0.60), w, int(h * 0.40)),
    "tree": lambda w, h: BoundingBox(int(w * 0.08), int(h * 0.10), int(w * 0.32), int(h * 0.72)),
}

HARD_MASK_TARGETS = {"watermark", "logo", "text", "label", "caption", "connector", "arrow", "edge", "node", "box"}


def analyze_edit_request(
    image_bytes: bytes,
    prompt_text: str,
    *,
    filename: Optional[str] = None,
    existing_diagram_model: Optional[DiagramModel] = None,
    mode_override: Optional[str] = None,
    server_url: Optional[str] = None,
) -> EditingAnalysis:
    intent = parse_edit_intent(prompt_text)
    generation_backend = get_generation_backend(server_url) if server_url else None
    diagram_model = None
    if mode_override != "image":
        diagram_model = existing_diagram_model or analyze_diagram_payload(
            image_bytes,
            filename,
            mode_override=mode_override,
            generation_backend=generation_backend,
        )
    if diagram_model is not None:
        return EditingAnalysis(
            content_mode=diagram_model.mode_state.current_mode if diagram_model.mode_state else "diagram",
            edit_intent=intent,
            region_selection=select_diagram_regions(diagram_model, intent),
            diagram_model=diagram_model,
            mode_state=diagram_model.mode_state,
            warnings=list(diagram_model.notes),
        )

    image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    return EditingAnalysis(
        content_mode="image",
        edit_intent=intent,
        region_selection=select_image_regions(image, intent),
        diagram_model=None,
        mode_state=None,
        warnings=[],
    )


def perform_precise_edit(
    image_bytes: bytes,
    prompt_text: str,
    *,
    model_name: str,
    server_url: str,
    filename: Optional[str] = None,
    existing_diagram_model: Optional[DiagramModel] = None,
    mode_override: Optional[str] = None,
    seed: Optional[int] = None,
    steps: int = 20,
    cfg: float = 8.0,
    sampler: str = "euler",
    scheduler: str = "normal",
    denoise: float = 0.6,
) -> PrecisionEditResult:
    analysis = analyze_edit_request(
        image_bytes,
        prompt_text,
        filename=filename,
        existing_diagram_model=existing_diagram_model,
        mode_override=mode_override,
        server_url=server_url,
    )

    if analysis.content_mode in {"diagram", "hybrid"} and analysis.diagram_model is not None:
        updated_model, selection = apply_prompt_to_diagram_model(analysis.diagram_model, analysis.edit_intent)
        analysis.region_selection = selection
        analysis.mode_state = updated_model.mode_state

        if updated_model != analysis.diagram_model and (
            analysis.content_mode == "diagram" or selection.affected_element_ids
        ):
            analysis.diagram_model = updated_model
            return PrecisionEditResult(
                image_bytes=render_diagram_model(updated_model),
                analysis=analysis,
            )

    edited_bytes = _localized_image_edit(
        image_bytes=image_bytes,
        prompt_text=prompt_text,
        analysis=analysis,
        model_name=model_name,
        server_url=server_url,
        seed=seed,
        steps=steps,
        cfg=cfg,
        sampler=sampler,
        scheduler=scheduler,
        denoise=denoise,
    )
    return PrecisionEditResult(image_bytes=edited_bytes, analysis=analysis)


def select_image_regions(image: Image.Image, intent) -> RegionSelection:
    width, height = image.size
    target_lower = intent.target_entity.lower()
    mask_type = "hard" if any(keyword in target_lower for keyword in HARD_MASK_TARGETS) else "soft"

    base_bbox = _bbox_from_target(target_lower, width, height)
    if intent.spatial_qualifiers:
        base_bbox = _apply_spatial_qualifiers(base_bbox, width, height, intent.spatial_qualifiers)

    if target_lower == "image region" and not intent.spatial_qualifiers:
        base_bbox = BoundingBox(int(width * 0.18), int(height * 0.18), int(width * 0.64), int(height * 0.64))

    base_bbox = base_bbox.clamp(width, height)
    region = SelectedRegion(
        bbox=base_bbox,
        confidence=max(0.35, intent.confidence),
        mask_type=mask_type,
        reason=f"Selected a localized edit crop for target '{intent.target_entity}'.",
    )
    return RegionSelection(
        regions=[region],
        confidence=region.confidence,
        mask_type=mask_type,
        rationale="Localized crop editing preserves untouched pixels outside the selected region.",
    )


def _localized_image_edit(
    *,
    image_bytes: bytes,
    prompt_text: str,
    analysis: EditingAnalysis,
    model_name: str,
    server_url: str,
    seed: Optional[int],
    steps: int,
    cfg: float,
    sampler: str,
    scheduler: str,
    denoise: float,
) -> bytes:
    generation_backend = get_generation_backend(server_url)
    selection = analysis.region_selection
    if not selection.regions or selection.confidence < 0.3:
        result = generation_backend.edit(
            GenerationRequest(
                model_name=model_name,
                prompt_text=_local_edit_prompt(prompt_text, analysis),
                input_image=image_bytes,
                seed=seed,
                steps=steps,
                cfg=cfg,
                sampler=sampler,
                scheduler=scheduler,
                denoise=denoise,
                task_type="image_edit",
            )
        )
        analysis.region_selection = RegionSelection(
            regions=[],
            confidence=0.2,
            mask_type="full",
            rationale="Fell back to full-image editing because no reliable local region was found.",
        )
        return result

    original = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    working = original.copy()

    for region in selection.regions:
        padding = max(16, int(min(region.bbox.width, region.bbox.height) * 0.18))
        crop_bbox = region.bbox.expanded(padding, original.width, original.height)
        crop = working.crop(
            (
                crop_bbox.x,
                crop_bbox.y,
                crop_bbox.x + crop_bbox.width,
                crop_bbox.y + crop_bbox.height,
            )
        )

        crop_bytes = _image_to_png_bytes(crop)
        edited_crop_bytes = generation_backend.edit(
            GenerationRequest(
                model_name=model_name,
                prompt_text=_local_edit_prompt(prompt_text, analysis),
                input_image=crop_bytes,
                seed=seed,
                steps=steps,
                cfg=cfg,
                sampler=sampler,
                scheduler=scheduler,
                denoise=min(denoise, 0.55 if selection.mask_type == "soft" else denoise),
                task_type="image_edit",
            )
        )
        edited_crop = Image.open(io.BytesIO(edited_crop_bytes)).convert("RGBA").resize(crop.size)
        mask = _build_blend_mask(crop.size, selection.mask_type)
        working.paste(edited_crop, (crop_bbox.x, crop_bbox.y), mask)

    return _image_to_png_bytes(working)


def _local_edit_prompt(prompt_text: str, analysis: EditingAnalysis) -> str:
    preserve = ", ".join(analysis.edit_intent.preserve_constraints) or "all unrelated content"
    return (
        f"{prompt_text}. Restrict changes to the requested target only. "
        f"Preserve {preserve}. Maintain the original composition, geometry, text, and layout outside the selected region."
    )


def _bbox_from_target(target_entity: str, width: int, height: int) -> BoundingBox:
    for keyword, builder in SEMANTIC_REGION_HINTS.items():
        if keyword in target_entity:
            return builder(width, height)
    return BoundingBox(int(width * 0.2), int(height * 0.2), int(width * 0.6), int(height * 0.6))


def _apply_spatial_qualifiers(
    bbox: BoundingBox,
    width: int,
    height: int,
    qualifiers: list[str],
) -> BoundingBox:
    candidate = bbox
    for qualifier in qualifiers:
        if qualifier == "top":
            candidate = BoundingBox(candidate.x, 0, candidate.width, max(candidate.height, int(height * 0.35)))
        elif qualifier == "bottom":
            candidate = BoundingBox(candidate.x, int(height * 0.65), candidate.width, max(candidate.height, int(height * 0.30)))
        elif qualifier == "left":
            candidate = BoundingBox(0, candidate.y, max(candidate.width, int(width * 0.35)), candidate.height)
        elif qualifier == "right":
            candidate = BoundingBox(int(width * 0.65), candidate.y, max(candidate.width, int(width * 0.30)), candidate.height)
        elif qualifier in {"center", "middle"}:
            candidate = BoundingBox(int(width * 0.25), int(height * 0.25), int(width * 0.50), int(height * 0.50))
        elif qualifier == "top-left":
            candidate = BoundingBox(0, 0, int(width * 0.35), int(height * 0.35))
        elif qualifier == "top-right":
            candidate = BoundingBox(int(width * 0.65), 0, int(width * 0.35), int(height * 0.35))
        elif qualifier == "bottom-left":
            candidate = BoundingBox(0, int(height * 0.65), int(width * 0.35), int(height * 0.35))
        elif qualifier == "bottom-right":
            candidate = BoundingBox(int(width * 0.65), int(height * 0.65), int(width * 0.35), int(height * 0.35))
        elif qualifier == "background":
            candidate = BoundingBox(0, 0, width, height)
        elif qualifier == "foreground":
            candidate = BoundingBox(int(width * 0.16), int(height * 0.16), int(width * 0.68), int(height * 0.68))
    return candidate


def _build_blend_mask(size: tuple[int, int], mask_type: str) -> Image.Image:
    if mask_type == "hard":
        return Image.new("L", size, 255)

    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    inset_x = max(6, int(size[0] * 0.05))
    inset_y = max(6, int(size[1] * 0.05))
    draw.rounded_rectangle(
        (inset_x, inset_y, max(inset_x + 1, size[0] - inset_x), max(inset_y + 1, size[1] - inset_y)),
        radius=max(8, min(size) // 10),
        fill=255,
    )
    return mask.filter(ImageFilter.GaussianBlur(radius=max(6, min(size) // 14)))


def _image_to_png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
