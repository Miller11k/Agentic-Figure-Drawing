# Diagram Feature

Browser-side editable diagram workspace.

Supports prompt-generated `DiagramModel` diagrams, Draw.io XML import/export, Mermaid import, reference-image reconstruction, direct node/edge/group edits, layout/zoom controls, history undo/redo, and `Edit`/`Source` views for inspecting generated XML or imported source.

Backend orchestration lives in `lib/workflows/diagram.ts`; deterministic model/XML helpers live in `lib/diagram` and `lib/xml`.
