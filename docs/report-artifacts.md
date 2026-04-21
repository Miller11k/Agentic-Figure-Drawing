# Report Artifacts and Evaluation Notes

This document provides presentation-ready descriptions aligned with the implemented prototype. It is intended to support a technical report or slide deck without inventing components that are not present in the codebase.

## System Architecture Diagram

Recommended figure: a layered architecture diagram with five horizontal bands.

Top band, "User Interface": show the three-panel Next.js application. The left panel contains upload, mode, prompt, action, and download controls. The center workspace contains either the interactive diagram editor or the image/mask editor. The right panel contains session history, selected artifact metadata, parsed intent, execution summary, direct-edit inspector controls, traces, and revert controls.

Second band, "API Layer": show thin typed Next.js route handlers for session, diagram, image, upload, artifact, download, and trace endpoints. Label the API layer as validation and delegation only.

Third band, "Workflow Services": show diagram generation, diagram editing, direct diagram editing, image generation, and image editing pipelines. Each pipeline should be drawn as staged blocks rather than a single monolithic call.

Fourth band, "Core Services": show OpenAI service wrappers, Draw.io XML utilities, direct-edit reducers, artifact storage, session/version service, trace service, and Zod validation.

Bottom band, "Persistence": show Prisma/SQLite tables for sessions, versions, artifacts, traces, and prompt/edit metadata plus local filesystem artifact storage.

Key arrows: UI to API, API to workflows, workflows to OpenAI/XML/storage/session services, session services to database, artifact services to filesystem, traces back to the right inspector.

## Internal Data Flow Diagram

Recommended figure: a workflow swimlane for one prompt-guided diagram edit.

1. User submits a prompt from the left panel with an active session and version.
2. The route validates the request using Zod and loads current session/artifact context.
3. The workflow imports the existing Draw.io XML into a `DiagramModel`.
4. OpenAI parses the edit intent.
5. OpenAI analyzes likely diagram targets.
6. OpenAI plans structured edits.
7. OpenAI transforms the XML or the deterministic layer applies structured edits, depending on the workflow path.
8. XML validation and repair run before persistence.
9. The updated XML is parsed back into a `DiagramModel`.
10. Artifact records are written for XML/model outputs.
11. A new version step is created and prompt/edit metadata is persisted.
12. Trace records are returned to the frontend for inspection.

The main point of the figure is that the system keeps XML, structured models, artifacts, versions, and traces synchronized after every operation.

## Session History and Versioning Diagram

Recommended figure: a timeline of immutable version steps inside one session.

Show a `Session` row with `currentVersionId` pointing to the latest version. Under it, draw version nodes such as `v1 import`, `v2 prompt-edit`, `v3 direct-edit`, `v4 image-edit`, and `v5 revert`.

Attach artifact records to each version. For diagram versions, show XML and `DiagramModel` artifacts. For image versions, show generated or edited image artifacts and optional mask/source metadata. For prompt-based versions, show a prompt/edit metadata record with parsed intent and analysis fields.

For revert, show a new version node created at the end of the timeline that clones metadata references from an earlier target version. Older versions remain unchanged.

## Evaluation Workflow Figure

Recommended figure: a four-column evaluation matrix.

Column 1, "Input": Draw.io XML fixtures, natural-language diagram prompts, direct-edit operations, uploaded images, and image masks.

Column 2, "Processing": XML round-trip tests, OpenAI wrapper validation, workflow orchestration, direct edit reducers, deterministic layout/routing, mask normalization/export, and API integration tests.

Column 3, "Checks": type checking, unit tests, integration tests, build validation, trace inspection, artifact retrieval, and manual UI smoke testing.

Column 4, "Outcomes": valid Draw.io XML, preserved diagram ids where practical, synchronized session versions, downloadable artifacts, visible traces, and clear error states.

Suggested local fixtures: use `public/samples/demo-architecture.drawio` for XML import and direct diagram edits, `public/samples/demo-source-image.svg` for image workspace screenshots, `public/samples/evaluation-fixtures.json` as the repeatable prompt/checklist source, and `benchmarks/fixtures/benchmark-suite.json` for benchmark categories covering XML compatibility, edit quality, latency, and recoverability.

## Evaluation Plan

The evaluation should measure whether the prototype behaves as a coherent agentic editing system rather than as isolated demos.

Functional correctness:

- Import representative Draw.io XML files and confirm that nodes, edges, labels, geometry, styles, and ids are preserved reasonably through import/export.
- Generate diagrams from prompts and confirm that outputs create valid XML/model artifacts and a session version.
- Apply prompt-guided diagram edits and confirm that a new version, artifacts, prompt metadata, and traces are produced.
- Apply direct canvas edits for node labels, positions, styles, additions, removals, and edges; verify stable ids and valid serialized XML.
- Generate and edit images; verify artifact persistence, download, and session history entries.
- Draw masks over images; verify coordinate normalization, paint/erase behavior, request payload shaping, and mask preview/export.

Reliability and recoverability:

- Exercise malformed XML fixtures and verify validation/repair behavior.
- Trigger OpenAI wrapper validation failures in tests and confirm errors are structured and traces mark the failed stage.
- Revert to earlier versions and confirm the current version pointer advances to a new revert step without mutating old history.

Usability:

- Verify that the left panel always exposes the active action controls.
- Verify that the center workspace reflects the active artifact and mode.
- Verify that the right panel exposes current version state, selected element data, prompt metadata, trace summaries, and revert actions.

Performance and presentation readiness:

- Record approximate latency for diagram generation/editing and image generation/editing.
- Confirm `npm run typecheck`, `npm test`, and `npm run build` before demonstrations.
- If `.next` is locked by a running dev server on Windows, confirm production build with `npm run build:isolated`.
- Run `npm run seed:demo` to create a local session with sample diagram and image artifacts for screenshots.
- Confirm that generated artifacts, visible mask overlays, and OpenAI edit masks can be downloaded and reopened where applicable.

## Known Limitations and Future Work

Draw.io compatibility is practical but not exhaustive. The XML parser and serializer focus on common `mxCell` structures, including nodes, edges, groups, labels, styles, and geometry. Complex diagrams.net features such as custom libraries, plugins, advanced containers, and unusual embedded metadata may require additional compatibility work.

The diagram editor is intentionally a prototype editing surface. It supports meaningful direct edits, deterministic layout modes, connector routing, inspector style palettes, and group controls, but it does not yet match the full interaction depth of diagrams.net. Future work should add multi-select, alignment tools, keyboard shortcuts, and more advanced edge routing constraints.

Image masking is usable for localized edits, with aligned drawing, paint/erase modes, brush size control, opacity, undo/redo, clear, normalized request shaping, and mask exports. Future work should add feathering, lasso selection, zoom/pan, and semantic selection.

The OpenAI service layer is modular and trace-aware, but production deployments should add rate limiting, retry policies tuned by operation type, cost telemetry, provider-side error classification, and model capability checks at startup.

Persistence currently uses Prisma with SQLite and local filesystem artifacts by default. A production system should add hosted object storage, authentication, multi-user authorization, background job processing for long-running generations, and centralized observability.

Evaluation now has fixed benchmark fixtures for XML compatibility, prompt edit quality, latency expectations, image masking, and recoverability. Future work should add an automated runner that executes the benchmark manifest against local APIs and records metrics for edit faithfulness, layout quality, trace latency, and recoverability.
