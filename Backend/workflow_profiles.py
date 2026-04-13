from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


SCRIPT_DIR = Path(__file__).resolve().parent
WORKFLOWS_DIR = SCRIPT_DIR / "workflows"


TASK_PROFILE_ENV_VARS = {
    "text_to_image": "WORKFLOW_PROFILE_TEXT_TO_IMAGE",
    "image_edit": "WORKFLOW_PROFILE_IMAGE_EDIT",
    "diagram_cleanup": "WORKFLOW_PROFILE_DIAGRAM_CLEANUP",
    "asset_refine": "WORKFLOW_PROFILE_ASSET_REFINE",
}


@dataclass(frozen=True)
class WorkflowProfile:
    name: str
    label: str
    family: str
    description: str
    text_template: Optional[Path] = None
    image_template: Optional[Path] = None
    env_text_template: Optional[str] = None
    env_image_template: Optional[str] = None
    supports_text: bool = True
    supports_image: bool = True
    recommended_width: int = 512
    recommended_height: int = 512
    recommended_cfg: float = 8.0
    recommended_steps: int = 20
    recommended_sampler: str = "euler"
    recommended_scheduler: str = "normal"

    def template_for_task(self, task_type: str) -> Optional[Path]:
        if task_type == "text_to_image":
            env_path = os.getenv(self.env_text_template or "")
            if env_path:
                return Path(env_path)
            return self.text_template

        if task_type in {"image_edit", "diagram_cleanup", "asset_refine"}:
            env_path = os.getenv(self.env_image_template or "")
            if env_path:
                return Path(env_path)
            return self.image_template

        return None


PROFILES: dict[str, WorkflowProfile] = {
    "legacy": WorkflowProfile(
        name="legacy",
        label="SD 1.x / checkpoint-compatible",
        family="stable-diffusion",
        description="Best compatibility with the repo's original CheckpointLoaderSimple workflows.",
        text_template=WORKFLOWS_DIR / "workflow_text_to_image_legacy.json",
        image_template=WORKFLOWS_DIR / "workflow_image_to_image_legacy.json",
        recommended_width=512,
        recommended_height=512,
        recommended_cfg=8.0,
        recommended_steps=20,
    ),
    "sdxl": WorkflowProfile(
        name="sdxl",
        label="SDXL",
        family="stable-diffusion-xl",
        description="Higher-quality local generation using SDXL-compatible checkpoint workflows.",
        text_template=WORKFLOWS_DIR / "workflow_text_to_image_sdxl.json",
        image_template=WORKFLOWS_DIR / "workflow_image_to_image_sdxl.json",
        recommended_width=1024,
        recommended_height=1024,
        recommended_cfg=6.5,
        recommended_steps=28,
    ),
    "sd35": WorkflowProfile(
        name="sd35",
        label="Stable Diffusion 3.5",
        family="stable-diffusion-3.5",
        description="Use exported ComfyUI templates for SD3.5 models when configured locally.",
        env_text_template="WORKFLOW_TEMPLATE_TEXT_TO_IMAGE_SD35",
        env_image_template="WORKFLOW_TEMPLATE_IMAGE_EDIT_SD35",
        recommended_width=1024,
        recommended_height=1024,
        recommended_cfg=5.5,
        recommended_steps=30,
    ),
    "flux": WorkflowProfile(
        name="flux",
        label="FLUX",
        family="flux",
        description="Local FLUX text-to-image and image editing with built-in Flux Schnell workflows, plus optional custom templates.",
        text_template=WORKFLOWS_DIR / "workflow_text_to_image_flux_schnell.json",
        image_template=WORKFLOWS_DIR / "workflow_image_to_image_flux_schnell.json",
        env_text_template="WORKFLOW_TEMPLATE_TEXT_TO_IMAGE_FLUX",
        env_image_template="WORKFLOW_TEMPLATE_IMAGE_EDIT_FLUX",
        recommended_width=640,
        recommended_height=640,
        recommended_cfg=1.0,
        recommended_steps=4,
        recommended_sampler="euler",
        recommended_scheduler="simple",
    ),
    "flux-kontext": WorkflowProfile(
        name="flux-kontext",
        label="FLUX Kontext",
        family="flux-kontext",
        description="Best for high-precision local image editing when a Kontext workflow template is configured.",
        env_image_template="WORKFLOW_TEMPLATE_IMAGE_EDIT_FLUX_KONTEXT",
        supports_text=False,
        recommended_width=1024,
        recommended_height=1024,
        recommended_cfg=3.0,
        recommended_steps=20,
        recommended_sampler="euler",
        recommended_scheduler="simple",
    ),
    "qwen-image": WorkflowProfile(
        name="qwen-image",
        label="Qwen Image",
        family="qwen-image",
        description="Local Qwen Image text-to-image with the built-in ComfyUI-style diffusion-model workflow.",
        text_template=WORKFLOWS_DIR / "workflow_text_to_image_qwen_image.json",
        env_text_template="WORKFLOW_TEMPLATE_TEXT_TO_IMAGE_QWEN_IMAGE",
        env_image_template="WORKFLOW_TEMPLATE_IMAGE_EDIT_QWEN_IMAGE",
        recommended_width=1024,
        recommended_height=1024,
        recommended_cfg=4.0,
        recommended_steps=20,
        recommended_sampler="euler",
        recommended_scheduler="simple",
        supports_image=False,
    ),
    "qwen-image-edit": WorkflowProfile(
        name="qwen-image-edit",
        label="Qwen Image Edit",
        family="qwen-image-edit",
        description="Local Qwen Image Edit with the built-in instruction-based editing workflow.",
        image_template=WORKFLOWS_DIR / "workflow_image_to_image_qwen_image_edit.json",
        env_image_template="WORKFLOW_TEMPLATE_IMAGE_EDIT_QWEN_IMAGE_EDIT",
        supports_text=False,
        recommended_width=1024,
        recommended_height=1024,
        recommended_cfg=2.5,
        recommended_steps=20,
        recommended_sampler="euler",
        recommended_scheduler="simple",
    ),
    "qwen-image-edit-gguf": WorkflowProfile(
        name="qwen-image-edit-gguf",
        label="Qwen Image Edit GGUF",
        family="qwen-image-edit-gguf",
        description="Quantized local Qwen Image Edit workflow for lower-VRAM laptops using ComfyUI-GGUF.",
        image_template=WORKFLOWS_DIR / "workflow_image_to_image_qwen_image_edit_gguf.json",
        env_image_template="WORKFLOW_TEMPLATE_IMAGE_EDIT_QWEN_IMAGE_EDIT_GGUF",
        supports_text=False,
        recommended_width=768,
        recommended_height=768,
        recommended_cfg=2.5,
        recommended_steps=8,
        recommended_sampler="euler",
        recommended_scheduler="simple",
    ),
}


def get_workflow_profiles() -> dict[str, WorkflowProfile]:
    return PROFILES


def profile_metadata() -> list[dict[str, object]]:
    profiles = []
    for profile in PROFILES.values():
        text_template = profile.template_for_task("text_to_image")
        image_template = profile.template_for_task("image_edit")
        profiles.append(
            {
                "name": profile.name,
                "label": profile.label,
                "family": profile.family,
                "description": profile.description,
                "supports_text": bool(profile.supports_text and text_template and text_template.exists()),
                "supports_image": bool(profile.supports_image and image_template and image_template.exists()),
                "recommended_width": profile.recommended_width,
                "recommended_height": profile.recommended_height,
                "recommended_cfg": profile.recommended_cfg,
                "recommended_steps": profile.recommended_steps,
                "recommended_sampler": profile.recommended_sampler,
                "recommended_scheduler": profile.recommended_scheduler,
                "text_template": str(text_template or ""),
                "image_template": str(image_template or ""),
            }
        )
    return profiles


def resolve_workflow_profile(task_type: str, model_name: str | None = None, explicit_profile: str | None = None) -> WorkflowProfile:
    candidate = (explicit_profile or "").strip().lower()
    if candidate:
        if candidate not in PROFILES:
            raise ValueError(f"Unknown workflow profile '{explicit_profile}'.")
        return PROFILES[candidate]

    env_var = TASK_PROFILE_ENV_VARS.get(task_type)
    env_profile = (os.getenv(env_var or "", "") or "").strip().lower()
    if env_profile:
        if env_profile not in PROFILES:
            raise ValueError(f"Unknown workflow profile '{env_profile}' from {env_var}.")
        return PROFILES[env_profile]

    detected = detect_profile_from_model_name(model_name, task_type)
    return PROFILES[detected]


def detect_profile_from_model_name(model_name: str | None, task_type: str) -> str:
    name = (model_name or "").strip().lower()
    if not name:
        if task_type in {"diagram_cleanup", "asset_refine"}:
            return "sdxl"
        return "legacy"

    if "kontext" in name:
        return "flux-kontext"
    if "qwen" in name and "gguf" in name and "edit" in name:
        return "qwen-image-edit-gguf"
    if "qwen" in name and "edit" in name:
        return "qwen-image-edit"
    if "qwen" in name:
        return "qwen-image"
    if "flux" in name:
        return "flux"
    if "sd3.5" in name or "3.5" in name or "sd35" in name or "stable-diffusion-3.5" in name:
        return "sd35"
    if "sdxl" in name or "xl" in name:
        return "sdxl"
    return "legacy"
