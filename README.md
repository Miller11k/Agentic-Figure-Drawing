# Agentic Figure Drawing

A session-aware diagram and image editing prototype built around OpenAI reasoning and generation workflows. The app supports importing Draw.io / diagrams.net XML, Mermaid source, and raster reference images; generating structured diagrams from prompts; reconstructing editable diagrams from screenshots/reference images; prompt-guided diagram edits; direct interactive diagram edits; image generation; uploaded-image editing; localized mask edits; artifact downloads; trace inspection; version history; and metadata-layer revert.

The implementation follows `masterspec.md` as the source of truth, with an explicit local override allowing Google Gemini only for image workflows. OpenAI remains the reasoning, validation, and XML authority. Google Gemini can be selected for image generation, diagram visual drafts, and mask-guided image editing; there is no ComfyUI or local non-API model workflow.

## Tech Stack

- Next.js App Router, React, TypeScript, Tailwind CSS
- Zustand for client editing/session state
- TanStack Query for frontend API orchestration
- Prisma with SQLite by default
- Draw.io / diagrams.net XML, Mermaid, and reference-image import with repair, serialization, and structured `DiagramModel` conversion
- Local filesystem artifact storage abstraction
- OpenAI API wrappers for structured reasoning, XML repair/editing, image generation, and image editing
- Optional Google Gemini Nano Banana 2 support for generated images, diagram visual drafts, and mask-guided image edits
- Sharp-backed SVG-to-PNG raster snapshots for diagram verification when available
- Vitest for backend, workflow, XML, mask, and frontend request-shaping tests
- Docker and Docker Compose for reproducible local development and production-like runtime

## Architecture Overview

The system is organized as thin UI and API layers over reusable service modules.

- `app/api/*` contains typed route handlers. Routes validate inputs with Zod, then delegate to services.
- `lib/workflows/*` contains explicit multi-stage orchestration for diagram and image workflows.
- `lib/openai/*` centralizes OpenAI client creation, model wrappers, trace-aware stage calls, response validation, and safe JSON parsing.
- `lib/xml/drawio.ts` isolates Draw.io-compatible XML import, validation, repair, and serialization.
- `lib/diagram/*` contains deterministic structured edit helpers and direct-edit reducers.
- `lib/session/*` owns session, version, history, revert, prompt metadata, and trace persistence.
- `lib/storage/*` owns artifact persistence and filesystem storage.
- `features/*` contains frontend domain modules for session state, diagram editing, and image editing.
- `types/core.ts` defines the shared strongly typed contracts used by backend, workflows, and UI.

The app stores every meaningful operation as a session version. Each version can point to one or more artifacts, such as Draw.io XML, diagram models, image outputs, uploads, or masks. OpenAI and deterministic workflow stages are recorded as traces for report/debug use through API responses, tests, and persisted metadata. The default frontend keeps artifact internals, trace inspection, and inspector-style observability out of the primary editing flow, while the history panel still exposes version ids for reproducible debugging and reports.

## Major Workflows

### Diagram Import

`POST /api/diagram/import` accepts Draw.io XML or Mermaid source. Draw.io XML is validated and repaired where possible. Mermaid flowchart, graph, sequence, class, and state-style source is normalized into a `DiagramSpec`, converted into a `DiagramModel`, serialized as Draw.io-compatible XML, persisted as artifacts, and stored as a new session version.

The left panel's diagram import control also accepts PNG, JPEG, and WebP reference images. Image imports call `POST /api/diagram/import-image`, persist the source image, ask OpenAI vision to extract an editable `DiagramSpec`, convert that spec into a `DiagramModel`, and store Draw.io-compatible XML. The reconstruction workflow is optimized for editability: visible text becomes editable labels, detected containers become groups, detected nodes/icons become separate movable elements, and detected relationships become connectors where the model can infer them.

Draw.io import/export preserves common geometry and raw `mxCell` attributes where practical. Grouped child nodes are rendered with absolute canvas coordinates for editing and exported back as Draw.io-relative group coordinates. Imported edge waypoints are preserved for closer route fidelity in both the editable canvas and SVG export.

### Diagram Generation

`POST /api/diagram/generate` runs staged generation:

1. OpenAI infers the intended diagram type from the user's prompt and expands it into an expert-level, diagram-specific generation prompt.
2. The configured diagram image provider can create a visual draft. When `gemini` is selected, this uses Google's Nano Banana 2 image model.
3. OpenAI vision converts the visual draft plus expanded prompt into a structured `DiagramSpec`. If no visual draft provider is configured, OpenAI generates the `DiagramSpec` directly from text.
4. Deterministic helpers convert the spec to a `DiagramModel`.
5. XML utilities serialize the model into Draw.io-compatible XML.
6. Validation/repair runs before the XML is stored.
7. The rendered diagram is optionally rasterized with Sharp and sent through a conservative OpenAI verification pass for minor label, node-type, and semantics corrections without replacing the generated structure.
8. Artifacts, version metadata, visual drafts, verification summaries, and traces are persisted.

### Prompt-Guided Diagram Editing

`POST /api/diagram/edit` runs explicit stages for intent parsing, target analysis, edit planning, XML transformation, XML validation/repair, model import, artifact persistence, and change summary generation.

### Direct Diagram Editing

`POST /api/diagram/direct-edit` accepts structured direct-edit operations from the interactive canvas, applies deterministic model updates, preserves stable ids where possible, serializes to XML, stores artifacts, and creates a new version.

The canvas includes optimized, hierarchical, grid, and radial deterministic layout modes, orthogonal connector routing, imported waypoint rendering, explicit fit-to-view, manual zoom controls, scrollable workspace navigation, source inspection, direct XML export, and version-history undo/redo. Manual zoom is preserved while editing; the canvas only fits the diagram when the user presses the fit control. The diagram workspace has an `Edit` view for interactive SVG editing and a `Source` view for inspecting the exact Draw.io-compatible XML or imported Mermaid source behind the current artifact.

### Image Generation

`POST /api/image/generate` calls the selected image provider wrapper, stores the generated image artifact, creates a version, and records trace metadata. OpenAI remains available as the default provider, while Gemini Nano Banana 2 can be enabled for image output through environment configuration.

### Image Editing and Masks

`POST /api/image/edit` supports uploaded or generated source images plus an optional mask artifact. The frontend mask editor draws directly over the rendered image and normalizes coordinates before request shaping. OpenAI receives the mask through its native mask parameter. Gemini receives the source image and mask image as multimodal input with strict localized-edit instructions added inside the provider layer. The backend stores edited image outputs and links mask/source metadata into version history without polluting saved user prompts with internal system instructions.

Mask tooling includes paint/erase modes, brush size, opacity, undo/redo, clear, preview visibility, visible overlay export, and edit-mask export.

### Revert and History

`POST /api/session/:id/revert` moves the session's current-version pointer back to the selected version without creating an extra timeline item. Older history remains immutable, and subsequent edits create new versions from the active state. In the UI, clicking a history card restores the full image or diagram state and updates the session pointer. `GET /api/session/:id` returns the full version timeline, current version, artifacts, prompt metadata, and structured workflow state. Browser storage persists lightweight editor state such as the active session, artifact, mode, provider, prompt, and history visibility so refreshes can recover the last workspace when persistence is available.

## OpenAI Integration Points

OpenAI calls are isolated in `lib/openai/service.ts` and composed by workflow services. Current wrappers include:

- `parseEditIntent(prompt, mode)`
- `analyzeDiagramTargets(diagramModel, parsedIntent)`
- `planDiagramEdits(diagramModel, parsedIntent, targetAnalysis)`
- `inferAndExpandDiagramPrompt(prompt)`
- `generateDiagramSpec(prompt)`
- `generateDiagramSpecFromImage(image, prompt, context)`
- `generateDiagramXmlFromSpec(diagramSpec)`
- `transformDiagramXml(existingXml, editPlan)`
- `validateAndRepairDiagramXml(xml)`
- `verifyDiagramAgainstPrompt(renderedImage, prompt, diagramSpec, diagramType)`
- `generateImageFromPrompt(prompt)`
- `editImageWithPrompt(image, prompt, mask?)`
- `summarizeArtifactChanges(before, after, context)`

Structured text outputs are parsed through safe JSON helpers and validated with Zod before workflow code uses them. Empty or invalid structured responses fail fast and are traced. XML repair has deterministic fallback behavior for malformed or partial Draw.io documents.

## Setup

### Docker Setup

Create your local environment file:

```bash
cp .env.example .env
```

Set `OPENAI_API_KEY` in `.env`. The Compose services override storage defaults so SQLite data lives in a Docker volume at `/app/data` and artifacts live in `/app/public/artifacts`.

Build and run the production-like container:

```bash
npm run docker:build
npm run docker:up
```

Or run the development container with the repo mounted for iterative work:

```bash
npm run docker:dev
```

Then open `http://localhost:3000`.

Docker persistence:

- `app_data` stores the SQLite database.
- `app_artifacts` stores uploaded/generated artifacts.
- `dev_node_modules` keeps container-installed dependencies separate from your host machine.

The container entrypoint runs `prisma generate` and `prisma migrate deploy` before starting Next.js.

### Local Node Setup

Install dependencies:

```bash
npm install
```

Create your local environment file:

```bash
cp .env.example .env
```

Set at least:

```bash
OPENAI_API_KEY="your-openai-api-key"
DATABASE_URL="file:./dev.db"
```

Optional model and storage settings are documented in `.env.example`.

To use Nano Banana 2 for image generation, diagram visual drafts, and mask-guided image edits, set the Google key and switch one or both provider settings:

```bash
GOOGLE_API_KEY="your-google-api-key"
GOOGLE_IMAGE_MODEL="gemini-3.1-flash-image-preview"
IMAGE_GENERATION_PROVIDER="gemini"
DIAGRAM_IMAGE_PROVIDER="gemini"
```

Leave `IMAGE_GENERATION_PROVIDER` and `DIAGRAM_IMAGE_PROVIDER` unset or set to `openai` when you want OpenAI-only workflows. Diagram generation automatically falls back to direct OpenAI structured generation if the Gemini visual-draft path is unavailable.

Sharp is installed as an application dependency. Diagram verification uses it to convert rendered SVG snapshots into PNG input for OpenAI vision checks when `DIAGRAM_VERIFICATION_ENABLED="true"`.

Generate the Prisma client and run migrations:

```bash
npm run prisma:generate
npm run prisma:migrate
```

Start the app:

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Useful Commands

```bash
npm run typecheck
npm run lint
npm test
npm run validate
npm run build
npm run build:isolated
npm run docker:build
npm run docker:up
npm run docker:dev
npm run seed:demo
npm run prisma:studio
```

On Windows or when a dev server is already holding `.next`, use `npm run build:isolated`. The project config respects `NEXT_DIST_DIR` and `.next-build/` is ignored by git.

`npm run seed:demo` creates a local presentation session with a sample Draw.io diagram and SVG image artifact. It writes artifact bytes under `public/artifacts/`, which is intentionally git-ignored.

## API Surface

- `POST /api/session/create`
- `GET /api/session/:id`
- `POST /api/session/:id/revert`
- `POST /api/diagram/import`
- `POST /api/diagram/import-image`
- `POST /api/diagram/generate`
- `POST /api/diagram/edit`
- `POST /api/diagram/direct-edit`
- `POST /api/image/generate`
- `POST /api/image/edit`
- `POST /api/upload`
- `GET /api/health`
- `GET /api/artifact/:id`
- `GET /api/download/:id`
- `GET /api/traces/:sessionId`

## Testing Status

The test suite covers:

- OpenAI wrapper response validation and safe structured parsing
- trace creation
- Draw.io XML import, repair, and round-trip behavior
- Draw.io group-relative geometry and imported edge waypoint preservation
- deterministic diagram layout and connector routing
- Mermaid-to-structured-diagram import
- reference-image-to-editable-diagram workflow orchestration
- direct diagram edit operations
- backend route flows for session, diagram, image, upload, artifact, and traces
- image mask coordinate normalization
- mask brush settings and localized edit request metadata
- frontend image edit request shaping and prompt sanitization
- session history and revert metadata behavior

Quality gates:

- `npm run lint` checks the Next.js/React code with `next/core-web-vitals`.
- `npm run typecheck` runs strict TypeScript validation.
- `npm test` runs the deterministic Vitest suite.
- `npm run build:isolated` runs a production-style Next build into `.next-build/`, which is useful on Windows or while a dev server owns `.next/`.
- `npm run validate` runs lint, typecheck, tests, and the isolated build as one presentation-ready check.

The live OpenAI smoke test is intentionally opt-in and skipped by default so the normal suite does not require network access or spend API credits. Set `LIVE_OPENAI_SMOKE=1` when you specifically want to validate real OpenAI schema responses against the service normalizers.

## Report Artifacts

Report-ready descriptions for the system architecture diagram, internal data-flow diagram, session history/versioning diagram, evaluation workflow figure, evaluation plan, limitations, and future work are in `docs/report-artifacts.md`.

Local fixtures for report screenshots and repeatable demos live in `public/samples/`:

- `basic.drawio`
- `demo-architecture.drawio`
- `demo-source-image.svg`
- `evaluation-fixtures.json`

Benchmark-oriented fixtures live in `benchmarks/fixtures/`:

- `benchmark-suite.json`
- `xml-compatibility.drawio`
- `recoverability-missing-root.xml`

## Known Limitations

- The diagram canvas supports practical interactive edits, optimized layout, deterministic layout modes, edge routing, imported waypoints, manual zoom, scroll, explicit fit-to-view, source inspection, direct XML export, and cleaner user-facing recovery. It is still intentionally lighter than diagrams.net for advanced power-user operations such as custom libraries, plugin-backed shape registries, and full keyboard command parity.
- Draw.io XML compatibility now preserves common structure, group-relative geometry, imported edge waypoints, and many raw `mxCell` attributes during round-trip. Very exotic diagrams.net features such as plugin payloads, embedded libraries, custom shape registries, advanced label geometries, or plugin-owned metadata may still require repair or targeted compatibility work.
- Mermaid import covers the diagram families most relevant to this prototype: flowchart/graph, sequence, class, and state-style edge/node declarations. Advanced Mermaid directives, themes, notes, and plugin-specific syntax are ignored or preserved only through the generated structured representation.
- OpenAI image generation/editing depends on account model access and provider-side latency.
- Gemini mask-guided editing uses the source image plus exported mask as multimodal guidance because Gemini does not use the same native alpha-mask inpainting parameter as OpenAI. It is supported, but OpenAI remains the stricter option for pixel-protected localized edits.
- Diagram verification is intentionally conservative. It can improve label clarity, node type semantics, and obvious wording issues, but it does not reconstruct missing topology or replace an otherwise usable diagram with a brand-new one.
- Sharp-backed verification snapshots require the optional rasterization step to succeed in the runtime environment; if rasterization fails, the workflow falls back to structured text verification.
- Revert and undo/redo move the current-version pointer through persisted history rather than creating extra timeline entries. This keeps history readable, but local per-keystroke command replay remains intentionally lightweight.
- The mask editor supports aligned drawing, paint/erase, lasso fill, feathered mask export, opacity, undo/redo, clear, request shaping, and mask export. It does not yet include semantic segmentation or AI-assisted automatic region selection.
- Authentication, multi-user authorization, hosted object storage, and production observability are outside the current prototype.

## Future Work

- Introduce cloud artifact storage for deployment.
- Add authenticated multi-user sessions.
- Add automated benchmark runners for XML compatibility, edit quality, latency, and user-facing recoverability.
- Add advanced diagram-editor commands such as multi-select alignment, distribute, snap guides, full keyboard shortcut parity, custom shape libraries, and richer edge-routing constraints.
- Add semantic image-mask selection, object-aware inpainting previews, and stronger provider-specific protection checks for non-masked image regions.
- Add asynchronous job queues, cancellation, and progress streaming for long-running multi-model diagram generation and verification workflows.
