# Image Feature

Browser-side image workspace for generation, upload editing, and mask-guided edits.

Includes preview/download controls plus brush and lasso mask tools with paint/erase modes, brush size, opacity, feathering, undo/redo, clear, and mask export.

Backend orchestration lives in `lib/workflows/image.ts`. OpenAI is the default provider; Gemini can be selected for image generation and multimodal edit guidance.
