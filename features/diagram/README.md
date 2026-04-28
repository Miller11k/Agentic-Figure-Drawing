# Diagram Feature

This feature boundary contains the browser-side editable diagram workspace. It supports:

- Prompt-generated diagrams backed by structured `DiagramModel` state.
- Draw.io / diagrams.net XML import and export.
- Mermaid source import.
- Reference-image reconstruction through `POST /api/diagram/import-image`.
- Direct canvas edits for nodes, labels, styles, connectors, resizing, movement, grouping state, layout, zoom, and history undo/redo.
- `Edit` and `Source` views so users can inspect the underlying Draw.io-compatible XML or imported Mermaid source.

Route-facing orchestration lives in `lib/workflows/diagram.ts`; deterministic XML and model helpers live under `lib/xml` and `lib/diagram`.
