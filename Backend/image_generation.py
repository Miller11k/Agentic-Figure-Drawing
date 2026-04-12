from __future__ import annotations

import io
import json
import os
import random
import time
from copy import deepcopy
from typing import Any

import requests
from dotenv import load_dotenv
from PIL import Image

try:
    from .workflow_profiles import profile_metadata, resolve_workflow_profile
except ImportError:
    from workflow_profiles import profile_metadata, resolve_workflow_profile


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(SCRIPT_DIR)
REQUEST_TIMEOUT_SECONDS = 60
POLL_INTERVAL_SECONDS = 1
RENDER_TIMEOUT_SECONDS = 300
DEFAULT_NEGATIVE_PROMPT = (
    "text, watermark, blurry, distorted, malformed anatomy, duplicate subjects, low quality, noisy"
)


class GenerationError(RuntimeError):
    """Raised when the upstream image generation server cannot fulfill a request."""


def _require_server_url(server_url: str | None) -> str:
    if not server_url:
        raise GenerationError("SERVER_URL is not configured.")
    return server_url.rstrip("/")


def _load_workflow(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as workflow_file:
        return json.load(workflow_file)


def _queue_prompt(server_url: str, workflow: dict[str, Any]) -> str:
    try:
        response = requests.post(
            f"{server_url}/prompt",
            json={"prompt": workflow},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise GenerationError(f"Could not reach image server at {server_url}/prompt: {exc}") from exc
    if response.status_code != 200:
        raise GenerationError(f"Image server rejected the request: {response.text}")
    return response.json()["prompt_id"]


def _wait_for_output_filename(server_url: str, prompt_id: str) -> str:
    started_at = time.time()
    while time.time() - started_at < RENDER_TIMEOUT_SECONDS:
        try:
            history_response = requests.get(
                f"{server_url}/history/{prompt_id}",
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            history_response.raise_for_status()
        except requests.RequestException as exc:
            raise GenerationError(
                f"Lost contact with image server while polling {server_url}/history/{prompt_id}: {exc}"
            ) from exc

        history = history_response.json()
        if prompt_id in history:
            outputs = history[prompt_id].get("outputs", {})
            for node_output in outputs.values():
                images = node_output.get("images", [])
                if images:
                    filename = images[0].get("filename")
                    if filename:
                        return filename
            raise GenerationError("Image server completed without returning a saved image.")
        time.sleep(POLL_INTERVAL_SECONDS)

    raise GenerationError("Timed out while waiting for the image server to finish rendering.")


def _fetch_image_bytes(server_url: str, filename: str) -> bytes:
    try:
        response = requests.get(
            f"{server_url}/view",
            params={"filename": filename},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise GenerationError(f"Could not fetch rendered image from {server_url}/view: {exc}") from exc
    if response.status_code != 200:
        raise GenerationError("Image server finished the job but the rendered image could not be fetched.")
    return response.content


def _upload_input_image(server_url: str, input_image: bytes | str) -> str:
    try:
        if isinstance(input_image, bytes):
            files = {"image": ("input_image.png", input_image, "image/png")}
            response = requests.post(
                f"{server_url}/upload/image",
                files=files,
                data={"overwrite": "true"},
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
        else:
            with open(input_image, "rb") as image_file:
                files = {"image": (os.path.basename(input_image), image_file)}
                response = requests.post(
                    f"{server_url}/upload/image",
                    files=files,
                    data={"overwrite": "true"},
                    timeout=REQUEST_TIMEOUT_SECONDS,
                )
    except requests.RequestException as exc:
        raise GenerationError(f"Could not upload source image to {server_url}/upload/image: {exc}") from exc

    if response.status_code != 200:
        raise GenerationError(f"Uploading the source image failed: {response.text}")
    return response.json()["name"]


def _object_info(server_url: str) -> dict[str, Any]:
    server_url = _require_server_url(server_url)
    try:
        response = requests.get(
            f"{server_url}/object_info",
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise GenerationError(f"Could not fetch models from {server_url}/object_info: {exc}") from exc

    try:
        return response.json()
    except ValueError as exc:
        raise GenerationError("Image server did not return valid JSON for /object_info.") from exc


def _extract_option_list(node_info: dict[str, Any], key: str) -> list[str]:
    try:
        value = node_info["input"]["required"][key][0]
    except (KeyError, IndexError, TypeError):
        return []
    return [item for item in value if isinstance(item, str)] if isinstance(value, list) else []


def list_models(server_url: str | None) -> list[str]:
    data = _object_info(server_url)
    checkpoints = _extract_option_list(data.get("CheckpointLoaderSimple", {}), "ckpt_name")
    diffusion_models = _extract_option_list(data.get("UNETLoader", {}), "unet_name")
    ordered_models: list[str] = []
    for model_name in [*checkpoints, *diffusion_models]:
        if model_name and model_name not in ordered_models:
            ordered_models.append(model_name)
    return ordered_models


def list_model_catalog(server_url: str | None) -> dict[str, list[str]]:
    data = _object_info(server_url)
    catalog = {
        "checkpoints": _extract_option_list(data.get("CheckpointLoaderSimple", {}), "ckpt_name"),
        "diffusion_models": _extract_option_list(data.get("UNETLoader", {}), "unet_name"),
        "clip_models": _extract_option_list(data.get("CLIPLoader", {}), "clip_name"),
        "vae_models": _extract_option_list(data.get("VAELoader", {}), "vae_name"),
    }
    return catalog


def display_available_models(server_url):
    models = list_models(server_url)
    if not models:
        print("No local models found. Check your ComfyUI model folders.")
    else:
        print("\nAvailable Local Models:")
        for i, model_name in enumerate(models):
            print(f"[{i}] {model_name}")


def resolve_model_name(model_name: str | None, server_url: str | None) -> str:
    if model_name:
        return model_name

    env_model = os.getenv("MODEL")
    if env_model:
        return env_model

    models = list_models(server_url)
    if models:
        return models[0]
    raise GenerationError("No model_name was provided and no model could be discovered from the server.")


def workflow_profile_catalog() -> list[dict[str, object]]:
    return profile_metadata()


def process_prompt(
    model_name,
    prompt_text,
    server_url,
    width=512,
    height=512,
    seed=None,
    steps=20,
    cfg=8.0,
    sampler="euler",
    scheduler="normal",
    workflow_profile: str | None = None,
    negative_prompt: str | None = None,
):
    """Generates a new image from text using the configured workflow profile."""
    server_url = _require_server_url(server_url)
    workflow = _prepare_workflow(
        task_type="text_to_image",
        model_name=model_name,
        prompt_text=prompt_text,
        server_url=server_url,
        width=width,
        height=height,
        seed=seed,
        steps=steps,
        cfg=cfg,
        sampler=sampler,
        scheduler=scheduler,
        denoise=1.0,
        workflow_profile=workflow_profile,
        negative_prompt=negative_prompt,
    )

    prompt_id = _queue_prompt(server_url, workflow)
    output_filename = _wait_for_output_filename(server_url, prompt_id)
    return _fetch_image_bytes(server_url, output_filename)


def process_image(
    model_name,
    prompt_text,
    server_url,
    input_image,
    seed=None,
    steps: int = 20,
    cfg: float = 8.0,
    sampler="euler",
    scheduler="normal",
    denoise: float = 0.6,
    denoise_val: float | None = None,
    workflow_profile: str | None = None,
    negative_prompt: str | None = None,
):
    """Edits an existing image using the configured workflow profile."""
    del denoise_val

    server_url = _require_server_url(server_url)
    server_filename = _upload_input_image(server_url, input_image)
    workflow = _prepare_workflow(
        task_type="image_edit",
        model_name=model_name,
        prompt_text=prompt_text,
        server_url=server_url,
        width=None,
        height=None,
        seed=seed,
        steps=steps,
        cfg=cfg,
        sampler=sampler,
        scheduler=scheduler,
        denoise=denoise,
        workflow_profile=workflow_profile,
        negative_prompt=negative_prompt,
        input_image_name=server_filename,
    )

    prompt_id = _queue_prompt(server_url, workflow)
    output_filename = _wait_for_output_filename(server_url, prompt_id)
    return _fetch_image_bytes(server_url, output_filename)


def edit_image(image, prompt, mask=None, config=None) -> bytes:
    """Spec-aligned convenience wrapper for prompt-driven editing."""
    config = config or {}
    del mask
    return process_image(
        model_name=config.get("model_name"),
        prompt_text=prompt,
        server_url=config.get("server_url"),
        input_image=image,
        seed=config.get("seed"),
        steps=config.get("steps", 20),
        cfg=config.get("cfg", 8.0),
        sampler=config.get("sampler", "euler"),
        scheduler=config.get("scheduler", "normal"),
        denoise=config.get("denoise", 0.6),
        workflow_profile=config.get("workflow_profile"),
        negative_prompt=config.get("negative_prompt"),
    )


def _prepare_workflow(
    *,
    task_type: str,
    model_name: str,
    prompt_text: str,
    server_url: str,
    width: int | None,
    height: int | None,
    seed: int | None,
    steps: int,
    cfg: float,
    sampler: str,
    scheduler: str,
    denoise: float,
    workflow_profile: str | None,
    negative_prompt: str | None,
    input_image_name: str | None = None,
) -> dict[str, Any]:
    resolved_profile = resolve_workflow_profile(task_type, model_name=model_name, explicit_profile=workflow_profile)
    template_path = resolved_profile.template_for_task(task_type)
    if template_path is None:
        raise GenerationError(
            f"Workflow profile '{resolved_profile.name}' does not support task '{task_type}'."
        )
    if not template_path.exists():
        raise GenerationError(
            f"Workflow template for profile '{resolved_profile.name}' and task '{task_type}' was not found at '{template_path}'."
        )

    final_seed = seed if seed is not None else random.randint(1, 1_000_000_000_000)
    context = {
        "__MODEL__": model_name,
        "__PROMPT__": prompt_text,
        "__NEGATIVE_PROMPT__": negative_prompt or os.getenv("NEGATIVE_PROMPT", DEFAULT_NEGATIVE_PROMPT),
        "__INPUT_IMAGE__": input_image_name or "",
        "__QWEN_CLIP__": os.getenv("QWEN_CLIP_MODEL", "qwen_2.5_vl_7b_fp8_scaled.safetensors"),
        "__QWEN_VAE__": os.getenv("QWEN_VAE_MODEL", "qwen_image_vae.safetensors"),
        "__WIDTH__": width if width is not None else resolved_profile.recommended_width,
        "__HEIGHT__": height if height is not None else resolved_profile.recommended_height,
        "__SEED__": final_seed,
        "__STEPS__": steps or resolved_profile.recommended_steps,
        "__CFG__": cfg,
        "__SAMPLER__": sampler,
        "__SCHEDULER__": scheduler,
        "__DENOISE__": denoise,
    }

    workflow = _load_workflow(str(template_path))
    return _render_workflow_template(workflow, context)


def _render_workflow_template(template: Any, context: dict[str, Any]) -> Any:
    rendered = _replace_placeholders(deepcopy(template), context)
    return rendered


def _replace_placeholders(value: Any, context: dict[str, Any]) -> Any:
    if isinstance(value, dict):
        return {key: _replace_placeholders(item, context) for key, item in value.items()}

    if isinstance(value, list):
        return [_replace_placeholders(item, context) for item in value]

    if isinstance(value, str):
        if value in context:
            return context[value]

        replaced = value
        for placeholder, replacement in context.items():
            if placeholder in replaced:
                replaced = replaced.replace(placeholder, str(replacement))
        return replaced

    return value


if __name__ == "__main__":
    env_path = os.path.join(PARENT_DIR, ".env")

    try:
        if not load_dotenv(dotenv_path=env_path):
            raise FileNotFoundError("Environment file (.env) not found in parent directory.")
    except Exception as exc:
        print(f"Startup Error: {exc}")

    server_url = os.getenv("SERVER_URL")
    model = os.getenv("MODEL") or resolve_model_name(None, server_url)

    print("--- Starting Stage 1: Text-to-Image ---")
    first_image_bytes = process_prompt(
        model_name=model,
        prompt_text="A futuristic city built into a giant glowing mushroom, cinematic lighting",
        server_url=server_url,
        workflow_profile=os.getenv("WORKFLOW_PROFILE_TEXT_TO_IMAGE"),
    )

    if first_image_bytes:
        Image.open(io.BytesIO(first_image_bytes)).show(title="Stage 1 Result")

        print("\n--- Starting Stage 2: Image-to-Image ---")
        second_image_bytes = process_image(
            model_name=model,
            prompt_text="Change this image so it is in the style of surrealism.",
            server_url=server_url,
            input_image=first_image_bytes,
            denoise=0.6,
            workflow_profile=os.getenv("WORKFLOW_PROFILE_IMAGE_EDIT"),
        )
        if second_image_bytes:
            Image.open(io.BytesIO(second_image_bytes)).show(title="Stage 2 Result")
