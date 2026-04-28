# Image Feature

This feature boundary contains the browser-side image workspace. It supports:

- Prompt-based image generation through the configured provider.
- Uploaded-image editing.
- Prompt-based and mask-based image editing.
- Brush and lasso mask tools.
- Paint/erase modes, brush size, mask opacity, feathering, undo/redo, clear, and mask export.
- Downloading current/generated image outputs.

Backend orchestration lives in `lib/workflows/image.ts`. OpenAI is the default provider; Gemini can be selected for image generation and multimodal edit guidance when configured.
