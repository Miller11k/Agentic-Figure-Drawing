# Agentic Figure Drawing

A session-aware diagram and image editing prototype built around OpenAI reasoning and generation workflows. The app supports importing Draw.io / diagrams.net XML, generating structured diagrams from prompts, prompt-guided diagram edits, direct interactive diagram edits, image generation, uploaded-image editing, localized mask edits, artifact downloads, trace inspection, version history, and metadata-layer revert.

The implementation follows `masterspec.md` as the source of truth. OpenAI is the only AI provider used by the application; there is no ComfyUI or non-OpenAI model workflow.

## Tech Stack

- Next.js App Router, React, TypeScript, Tailwind CSS
- Zustand for client editing/session state
- TanStack Query for frontend API orchestration
- Prisma with SQLite by default
- Draw.io / diagrams.net XML import, repair, serialization, and structured `DiagramModel` conversion
- Local filesystem artifact storage abstraction
- OpenAI API wrappers for structured reasoning, XML repair/editing, image generation, and image editing
- Vitest for backend, workflow, XML, mask, and frontend request-shaping tests

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

The app stores every meaningful operation as a session version. Each version can point to one or more artifacts, such as Draw.io XML, diagram models, image outputs, uploads, or masks. OpenAI and deterministic workflow stages are recorded as traces so the right inspector can show what happened without exposing raw provider details.

## Major Workflows

### Diagram Import

`POST /api/diagram/import` accepts Draw.io XML, validates and repairs it where possible, converts it into a normalized `DiagramModel`, persists XML/model artifacts, and creates a new session version.

### Diagram Generation

`POST /api/diagram/generate` runs staged generation:

1. OpenAI creates a structured `DiagramSpec`.
2. Deterministic helpers convert the spec to a `DiagramModel`.
3. XML utilities serialize the model into Draw.io-compatible XML.
4. Validation/repair runs before the XML is stored.
5. Artifacts, version metadata, and traces are persisted.

### Prompt-Guided Diagram Editing

`POST /api/diagram/edit` runs explicit stages for intent parsing, target analysis, edit planning, XML transformation, XML validation/repair, model import, artifact persistence, and change summary generation.

### Direct Diagram Editing

`POST /api/diagram/direct-edit` accepts structured direct-edit operations from the interactive canvas, applies deterministic model updates, preserves stable ids where possible, serializes to XML, stores artifacts, and creates a new version.

The canvas includes hierarchical, grid, and radial deterministic layout modes plus orthogonal connector routing. The right inspector can apply node, edge, and group style palettes; assign nodes to groups; create groups from selected nodes; rename groups; and ungroup/delete groups through the same direct-edit API path.

### Image Generation

`POST /api/image/generate` calls the OpenAI image generation wrapper, stores the generated image artifact, creates a version, and records trace metadata.

### Image Editing and Masks

`POST /api/image/edit` supports uploaded or generated source images plus an optional mask artifact. The frontend mask editor draws directly over the rendered image and normalizes coordinates before request shaping. The backend stores edited image outputs and links mask/source metadata into version history.

Mask tooling includes paint/erase modes, brush size, opacity, undo/redo, clear, preview visibility, visible overlay export, and OpenAI edit-mask export.

### Revert and History

`POST /api/session/:id/revert` creates a new `revert` version that points to cloned metadata records for the target version's artifacts. It does not mutate older history. `GET /api/session/:id` returns the full version timeline, current version, artifacts, prompt metadata, and structured workflow state.

## OpenAI Integration Points

OpenAI calls are isolated in `lib/openai/service.ts` and composed by workflow services. Current wrappers include:

- `parseEditIntent(prompt, mode)`
- `analyzeDiagramTargets(diagramModel, parsedIntent)`
- `planDiagramEdits(diagramModel, parsedIntent, targetAnalysis)`
- `generateDiagramSpec(prompt)`
- `generateDiagramXmlFromSpec(diagramSpec)`
- `transformDiagramXml(existingXml, editPlan)`
- `validateAndRepairDiagramXml(xml)`
- `generateImageFromPrompt(prompt)`
- `editImageWithPrompt(image, prompt, mask?)`
- `summarizeArtifactChanges(before, after, context)`

Structured text outputs are parsed through safe JSON helpers and validated with Zod before workflow code uses them. Empty or invalid structured responses fail fast and are traced. XML repair has deterministic fallback behavior for malformed or partial Draw.io documents.

## Setup

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
npm test
npm run build
npm run build:isolated
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
- `POST /api/diagram/generate`
- `POST /api/diagram/edit`
- `POST /api/diagram/direct-edit`
- `POST /api/image/generate`
- `POST /api/image/edit`
- `POST /api/upload`
- `GET /api/artifact/:id`
- `GET /api/download/:id`
- `GET /api/traces/:sessionId`

## Testing Status

The test suite covers:

- OpenAI wrapper response validation and safe structured parsing
- trace creation
- Draw.io XML import, repair, and round-trip behavior
- deterministic diagram layout and connector routing
- direct diagram edit operations
- backend route flows for session, diagram, image, upload, artifact, and traces
- image mask coordinate normalization
- mask brush settings and localized edit request metadata
- frontend image edit request shaping
- session history and revert metadata behavior

Run `npm test` before presenting or extending the prototype.

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

- The diagram canvas supports practical interactive edits, layout modes, edge routing, and inspector-driven style/group edits, but it is not a full diagrams.net replacement.
- Draw.io XML compatibility focuses on common `mxCell` node, edge, group, label, style, and geometry structures. Exotic diagrams.net features may round-trip as metadata or require repair.
- OpenAI image generation/editing depends on account model access and provider-side latency.
- Revert is metadata-layer revert: it creates a new version that references the selected version's artifacts rather than physically duplicating stored files.
- The mask editor supports aligned drawing, paint/erase, opacity, undo/redo, clear, request shaping, and mask export, but does not yet include advanced selection tools such as feathering, lasso, or semantic segmentation.
- Authentication, multi-user authorization, hosted object storage, and production observability are outside the current prototype.

## Future Work

- Introduce cloud artifact storage for deployment.
- Add authenticated multi-user sessions.
- Add automated benchmark runners for XML compatibility, edit quality, latency, and user-facing recoverability.
