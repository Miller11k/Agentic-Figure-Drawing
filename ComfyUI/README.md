Place ComfyUI runtime data here when using Docker Compose.

- Put checkpoint files in `ComfyUI/models/checkpoints/`
- Put FLUX, SD3.5, Qwen Image, and other diffusion-model weights in `ComfyUI/models/diffusion_models/` when the workflow expects separate diffusion-model loading
- Put matching text encoders in `ComfyUI/models/text_encoders/`
- Put VAEs in `ComfyUI/models/vae/`
- Optional LoRAs go in `ComfyUI/models/loras/`
- Generated images will appear in `ComfyUI/output/`
- Uploaded source images can be stored in `ComfyUI/input/`

The repo ignores these runtime folders so large model files do not end up in git.

## Recommended Local Profiles

This project can now route different tasks to different local model families:

- `legacy`: classic checkpoint-compatible fallback
- `sdxl`: best built-in upgrade path with the included workflow templates
- `sd35`: configure with exported ComfyUI templates
- `flux`: built-in Flux Schnell text-to-image workflow, plus optional custom FLUX templates for other tasks
- `flux-kontext`: recommended for precise local editing when available
- `qwen-image`: built-in workflow support, but you still need to install the Qwen Image local weights
- `qwen-image-edit`: built-in workflow support, but you still need to install the Qwen Image Edit local weights
- `qwen-image-edit-gguf`: quantized low-VRAM Qwen Image Edit support through `ComfyUI-GGUF`

## Current Local Recommendation

- Use `flux1-schnell-fp8.safetensors` with the `flux` profile for prompt-only generation.
- Use `flux1-schnell-fp8.safetensors` with the `flux` profile for standard image editing too.
- Keep `sd_xl_base_1.0.safetensors` with the `sdxl` profile available for cleanup-oriented fallback tasks.
- On this repo's 8 GB RTX 4070 Laptop GPU, the practical local Qwen path is `Qwen-Image-Edit-2509-Q2_K.gguf` with the `qwen-image-edit-gguf` profile.
- Keep FLUX as the default day-to-day edit path unless you explicitly want Qwen's slower but stronger instruction-following edit behavior.

## Environment Variables

Task-specific local model defaults:

- `MODEL_TEXT_TO_IMAGE`
- `MODEL_IMAGE_EDIT`
- `MODEL_DIAGRAM_CLEANUP`
- `MODEL_ASSET_REFINE`

Task-specific workflow routing:

- `WORKFLOW_PROFILE_TEXT_TO_IMAGE`
- `WORKFLOW_PROFILE_IMAGE_EDIT`
- `WORKFLOW_PROFILE_DIAGRAM_CLEANUP`
- `WORKFLOW_PROFILE_ASSET_REFINE`

Advanced custom workflow template paths:

- `WORKFLOW_TEMPLATE_TEXT_TO_IMAGE_SD35`
- `WORKFLOW_TEMPLATE_IMAGE_EDIT_SD35`
- `WORKFLOW_TEMPLATE_TEXT_TO_IMAGE_FLUX`
- `WORKFLOW_TEMPLATE_IMAGE_EDIT_FLUX`
- `WORKFLOW_TEMPLATE_IMAGE_EDIT_FLUX_KONTEXT`
- `WORKFLOW_TEMPLATE_TEXT_TO_IMAGE_QWEN_IMAGE`
- `WORKFLOW_TEMPLATE_IMAGE_EDIT_QWEN_IMAGE`
- `WORKFLOW_TEMPLATE_IMAGE_EDIT_QWEN_IMAGE_EDIT`
- `WORKFLOW_TEMPLATE_IMAGE_EDIT_QWEN_IMAGE_EDIT_GGUF`
- `QWEN_CLIP_MODEL`
- `QWEN_VAE_MODEL`
- `QWEN_GGUF_CLIP_MODEL`
- `QWEN_GGUF_VAE_MODEL`

## Template Placeholders

For exported ComfyUI workflow JSON files, replace editable values with:

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

## Working Local Qwen GGUF Setup

The current verified local Qwen edit path in this repo is:

- diffusion model: `ComfyUI/models/unet/Qwen-Image-Edit-2509-Q2_K.gguf`
- text encoder: `ComfyUI/models/text_encoders/Qwen2.5-VL-7B-Instruct-Q2_K.gguf`
- mmproj: `ComfyUI/models/text_encoders/Qwen2.5-VL-7B-Instruct-mmproj-BF16.gguf`
- vae: `ComfyUI/models/vae/Qwen_Image-VAE.safetensors`
- workflow profile: `qwen-image-edit-gguf`

Use that profile for prompt+image editing when you want the strongest local Qwen route on this laptop.
