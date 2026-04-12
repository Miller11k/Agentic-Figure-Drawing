from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

try:
    from .image_generation import (
        GenerationError,
        list_model_catalog,
        list_models,
        process_image,
        process_prompt,
        resolve_model_name,
        workflow_profile_catalog,
    )
    from .workflow_profiles import resolve_workflow_profile
except ImportError:
    from image_generation import (
        GenerationError,
        list_model_catalog,
        list_models,
        process_image,
        process_prompt,
        resolve_model_name,
        workflow_profile_catalog,
    )
    from workflow_profiles import resolve_workflow_profile


TASK_ENV_DEFAULTS = {
    "text_to_image": "MODEL_TEXT_TO_IMAGE",
    "image_edit": "MODEL_IMAGE_EDIT",
    "diagram_cleanup": "MODEL_DIAGRAM_CLEANUP",
    "asset_refine": "MODEL_ASSET_REFINE",
}


@dataclass
class GenerationRequest:
    prompt_text: str
    model_name: Optional[str] = None
    input_image: Optional[bytes] = None
    workflow_profile: Optional[str] = None
    width: int = 512
    height: int = 512
    seed: Optional[int] = None
    steps: int = 20
    cfg: float = 8.0
    sampler: str = "euler"
    scheduler: str = "normal"
    denoise: float = 0.6
    task_type: str = "image_edit"


class GenerationBackend:
    provider_name = "base"

    def list_models(self) -> list[str]:
        raise NotImplementedError

    def list_model_catalog(self) -> dict[str, list[str]]:
        raise NotImplementedError

    def list_workflow_profiles(self) -> list[dict[str, object]]:
        raise NotImplementedError

    def resolve_model(self, requested_model: Optional[str], task_type: str) -> str:
        raise NotImplementedError

    def resolve_workflow_profile(self, requested_profile: Optional[str], model_name: Optional[str], task_type: str) -> str:
        raise NotImplementedError

    def resolve_task_execution(
        self,
        requested_model: Optional[str],
        requested_profile: Optional[str],
        task_type: str,
    ) -> tuple[str, str]:
        raise NotImplementedError

    def generate(self, request: GenerationRequest) -> bytes:
        raise NotImplementedError

    def edit(self, request: GenerationRequest) -> bytes:
        raise NotImplementedError

    def refine_asset(self, request: GenerationRequest) -> bytes:
        return self.edit(request)


class ComfyUIGenerationBackend(GenerationBackend):
    provider_name = "comfyui"

    def __init__(self, server_url: str):
        self.server_url = server_url

    def list_models(self) -> list[str]:
        return list_models(self.server_url)

    def list_model_catalog(self) -> dict[str, list[str]]:
        return list_model_catalog(self.server_url)

    def list_workflow_profiles(self) -> list[dict[str, object]]:
        return workflow_profile_catalog()

    def resolve_model(self, requested_model: Optional[str], task_type: str) -> str:
        if requested_model:
            return requested_model

        task_env_key = TASK_ENV_DEFAULTS.get(task_type)
        if task_env_key:
            task_model = os.getenv(task_env_key)
            if task_model:
                return task_model

        return resolve_model_name(None, self.server_url)

    def resolve_workflow_profile(self, requested_profile: Optional[str], model_name: Optional[str], task_type: str) -> str:
        return resolve_workflow_profile(task_type, model_name=model_name, explicit_profile=requested_profile).name

    def resolve_task_execution(
        self,
        requested_model: Optional[str],
        requested_profile: Optional[str],
        task_type: str,
    ) -> tuple[str, str]:
        model_name = self.resolve_model(requested_model, task_type)
        workflow_profile = resolve_workflow_profile(
            task_type,
            model_name=model_name,
            explicit_profile=requested_profile,
        )

        if workflow_profile.template_for_task(task_type) is not None:
            return model_name, workflow_profile.name

        fallback_model = self.resolve_model(None, task_type)
        fallback_profile = resolve_workflow_profile(task_type, model_name=fallback_model, explicit_profile=None)
        if fallback_profile.template_for_task(task_type) is None:
            raise GenerationError(
                f"No compatible workflow template is available for task '{task_type}' using model '{model_name}'."
            )
        return fallback_model, fallback_profile.name

    def generate(self, request: GenerationRequest) -> bytes:
        model_name, workflow_profile = self.resolve_task_execution(
            request.model_name,
            request.workflow_profile,
            request.task_type,
        )
        return process_prompt(
            model_name,
            request.prompt_text,
            self.server_url,
            request.width,
            request.height,
            request.seed,
            request.steps,
            request.cfg,
            request.sampler,
            request.scheduler,
            workflow_profile=workflow_profile,
        )

    def edit(self, request: GenerationRequest) -> bytes:
        if request.input_image is None:
            raise GenerationError("Image editing requires input_image bytes.")

        model_name, workflow_profile = self.resolve_task_execution(
            request.model_name,
            request.workflow_profile,
            request.task_type,
        )
        return process_image(
            model_name,
            request.prompt_text,
            self.server_url,
            request.input_image,
            request.seed,
            request.steps,
            request.cfg,
            request.sampler,
            request.scheduler,
            request.denoise,
            workflow_profile=workflow_profile,
        )


def get_generation_backend(server_url: str) -> GenerationBackend:
    provider_name = (os.getenv("GENERATION_BACKEND") or "comfyui").strip().lower()
    if provider_name != "comfyui":
        raise GenerationError(f"Unsupported generation backend '{provider_name}'.")
    return ComfyUIGenerationBackend(server_url)
