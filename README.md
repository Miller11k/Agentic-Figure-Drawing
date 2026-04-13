# Agentic-Figure-Drawing

Stateful AI image editing workflow built around a FastAPI backend, a static frontend, and a ComfyUI-compatible image generation server.

## What It Does

- `POST /generate` creates a new image from text and opens a tracked session.
- `POST /edit` edits the current session image or starts a new session from an uploaded image.
- `GET /history/{session_id}` returns the full edit chain for a session.
- `POST /undo` rolls the current image pointer back one step without destroying prior assets.

The backend stores each session on disk under `Backend/data/sessions/`, including the original image, every generated step, and metadata.

## Local Run

1. Start your ComfyUI server and set `SERVER_URL` in your environment or `.env`.
2. Install backend dependencies from `Backend/requirements.txt`.
3. Run the API with `python Backend/app.py`.
4. Serve `Frontend/` with any static file server, or use Docker Compose to launch nginx plus the API together.

## Docker Compose Stack

- `docker compose up -d --build comfyui` builds and starts a GPU-enabled ComfyUI service on `http://127.0.0.1:8188`.
- `docker compose up -d --build app` starts the frontend/backend container and points it at the Compose-managed ComfyUI service.
- `docker compose up -d --build` starts the full stack together.
- Put checkpoint files in `ComfyUI/models/checkpoints/` before expecting successful image generation.
- This repo is currently configured to use `flux1-schnell-fp8.safetensors` for both prompt-only generation and image editing, while `sd_xl_base_1.0.safetensors` remains available for diagram cleanup and asset refinement tasks.
- The local `.env` still points the non-Docker backend at `http://127.0.0.1:8188`, so a local API process can reuse the same ComfyUI container.
- For VS Code remote sessions, repo settings now label and auto-forward `5080` (frontend), `9988` (API), and `8188` (ComfyUI).

## Local Model Upgrades

The backend now supports per-task model routing plus workflow profiles, so you do not have to use the same local model for everything.

- `MODEL_TEXT_TO_IMAGE` controls fresh image generation.
- `MODEL_IMAGE_EDIT` controls localized image editing.
- `MODEL_DIAGRAM_CLEANUP` controls diagram cleanup or structured diagram rendering tasks.
- `MODEL_ASSET_REFINE` controls extracted asset cleanup/refinement.

You can also choose a workflow family per task:

- `WORKFLOW_PROFILE_TEXT_TO_IMAGE`
- `WORKFLOW_PROFILE_IMAGE_EDIT`
- `WORKFLOW_PROFILE_DIAGRAM_CLEANUP`
- `WORKFLOW_PROFILE_ASSET_REFINE`

Supported profiles:

- `legacy`: safest fallback for classic SD 1.x style checkpoint workflows
- `sdxl`: best built-in quality upgrade that works with the shipped templates
- `sd35`: expects a custom exported ComfyUI template via `WORKFLOW_TEMPLATE_TEXT_TO_IMAGE_SD35` and/or `WORKFLOW_TEMPLATE_IMAGE_EDIT_SD35`
- `flux`: includes a built-in local Flux Schnell text-to-image template, with optional custom FLUX templates for other tasks
- `flux-kontext`: expects a custom edit template via `WORKFLOW_TEMPLATE_IMAGE_EDIT_FLUX_KONTEXT`
- `qwen-image`: includes a built-in Qwen Image text-to-image workflow, but still requires the actual Qwen local weights
- `qwen-image-edit`: includes a built-in Qwen Image Edit workflow, but still requires the actual Qwen local weights
- `qwen-image-edit-gguf`: includes a built-in low-VRAM ComfyUI-GGUF edit workflow for quantized local Qwen Image Edit

### Recommended Setup

- Use `flux` for both prompt-only generation and standard image editing on this machine. The shipped default is tuned to `640x640` because that has been stable on the local 8 GB RTX 4070 Laptop GPU.
- Keep `sdxl` available for diagram cleanup and as a fallback when you want the older checkpoint-style workflow behavior.
- Use `qwen-image-edit-gguf` when you want the strongest local Qwen edit path on this machine. The verified working local model is `Qwen-Image-Edit-2509-Q2_K.gguf`, paired with the quantized `Qwen2.5-VL-7B-Instruct-Q2_K.gguf` encoder and the Qwen image VAE.
- Keep FLUX as the default for day-to-day speed and stability. On this machine's 8 GB GPU, native full-precision Qwen is still not a practical default.
- Keep `legacy` as a fallback for compatibility while you are migrating.

### Custom Workflow Templates

For advanced model families, export a working ComfyUI workflow JSON and replace the editable values with placeholders:

- `__MODEL__`
- `__PROMPT__`
- `__NEGATIVE_PROMPT__`
- `__INPUT_IMAGE__`
- `__WIDTH__`
- `__HEIGHT__`
- `__SEED__`
- `__STEPS__`
- `__CFG__`
- `__SAMPLER__`
- `__SCHEDULER__`
- `__DENOISE__`

Then point the matching `WORKFLOW_TEMPLATE_...` env var at that JSON file.

### Verified Local Qwen GGUF Path

This repo now includes a working quantized Qwen edit path through `ComfyUI-GGUF`.

- Model: `Qwen-Image-Edit-2509-Q2_K.gguf`
- Profile: `qwen-image-edit-gguf`
- Text encoder: `Qwen2.5-VL-7B-Instruct-Q2_K.gguf`
- MM projector: `Qwen2.5-VL-7B-Instruct-mmproj-BF16.gguf`
- VAE: `Qwen_Image-VAE.safetensors`

This route is slower than FLUX, but it now works locally for prompt+image edits and preserves session history correctly.

## Frontend Notes

- Prompt Only starts a fresh text-to-image session.
- Prompt + Image starts from an uploaded raster image.
- `.drawio` files can be imported into editable diagram mode.
- The frontend now exposes both `Processing Mode` and `Workflow Profile`, so you can keep image editing local while routing higher-quality tasks through stronger local workflows.
