# SAGE

SAGE is a session-aware diagram and image editing prototype built around OpenAI reasoning workflows. It imports Draw.io/diagrams.net XML, Mermaid, and reference images; generates editable diagrams; supports prompt-guided and direct diagram edits; generates and edits images; handles localized mask edits; stores artifacts; records traces; and preserves version history with revert.

OpenAI is the reasoning, validation, and XML authority. Gemini can optionally be used for image generation, diagram visual drafts, and mask-guided image editing.

## Stack

- Next.js App Router, React, TypeScript, Tailwind CSS
- Zustand, TanStack Query, Prisma with SQLite
- Draw.io XML, Mermaid import, structured `DiagramModel` conversion
- Local artifact storage, Docker/Docker Compose
- OpenAI wrappers for structured reasoning, XML repair/editing, and image workflows
- Optional Gemini Nano Banana 2 image support
- Sharp-backed diagram verification snapshots
- Vitest coverage for routes, workflows, XML, masks, and frontend request shaping

## Architecture

- `app/api/*` — typed route handlers with Zod validation.
- `lib/workflows/*` — diagram and image workflow orchestration.
- `lib/openai/*` and `lib/google/*` — provider clients, prompts, parsing, and service wrappers.
- `lib/xml/drawio.ts` — Draw.io XML import, validation, repair, and serialization.
- `lib/diagram/*` — diagram layout, SVG export, Mermaid import, and direct edit helpers.
- `lib/session/*` — sessions, versions, history, revert, prompt metadata, and traces.
- `lib/storage/*` — artifact persistence and local filesystem storage.
- `features/*` — frontend diagram, image, and session UI/state.
- `types/core.ts` — shared contracts for backend, workflows, and UI.

Every meaningful operation is stored as a session version. Versions can point to Draw.io XML, diagram models, generated images, uploads, masks, and traces.

## Workflows

### Diagram Import

`POST /api/diagram/import` accepts Draw.io XML or Mermaid source, repairs/normalizes where possible, converts to `DiagramModel`, serializes Draw.io XML, and stores a version. `POST /api/diagram/import-image` uses OpenAI vision to reconstruct an editable `DiagramSpec` from PNG/JPEG/WebP references.

### Diagram Generation

`POST /api/diagram/generate` expands the prompt, optionally creates a visual draft, produces a structured `DiagramSpec`, converts it to a `DiagramModel`, serializes and validates Draw.io XML, optionally verifies the rendered result, and persists artifacts/metadata/traces.

### Diagram Editing

`POST /api/diagram/edit` parses intent, resolves targets, plans edits, transforms XML, validates/repairs the result, imports the model, and stores a new version. `POST /api/diagram/direct-edit` applies structured canvas operations deterministically.

The canvas supports layout modes, orthogonal routing, imported waypoints, manual zoom, fit-to-view, source inspection, XML export, and history-based undo/redo.

### Image Workflows

`POST /api/image/generate` uses the selected image provider and stores the generated artifact. `POST /api/image/edit` supports uploaded/generated images with optional masks. Mask tools include paint/erase, lasso fill, brush size, opacity, feathering, undo/redo, clear, preview, and export.

### Revert and History

`POST /api/session/:id/revert` moves the current-version pointer without rewriting history. `GET /api/session/:id` returns versions, artifacts, prompt metadata, and workflow state. Browser storage keeps lightweight editor state across refreshes.

## Setup

### Docker

```bash
cp .env.example .env
# Set OPENAI_API_KEY in .env
npm run docker:build
npm run docker:up
```

For a mounted development container:

```bash
npm run docker:dev
```

Open `http://localhost:3000`. Docker volumes store SQLite data and generated artifacts.

### Local Node

```bash
npm install
cp .env.example .env
```

Set at least:

```bash
OPENAI_API_KEY="your-openai-api-key"
DATABASE_URL="file:./dev.db"
```

Optional Gemini image support:

```bash
GOOGLE_API_KEY="your-google-api-key"
GOOGLE_IMAGE_MODEL="gemini-3.1-flash-image-preview"
IMAGE_GENERATION_PROVIDER="gemini"
DIAGRAM_IMAGE_PROVIDER="gemini"
```

Run the app:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

## Commands

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

Use `npm run build:isolated` on Windows or when a dev server owns `.next/`. `npm run seed:demo` creates a local demo session and writes artifact bytes under `public/artifacts/`.

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

## Testing

The deterministic Vitest suite covers provider response parsing, traces, API routes, session/revert behavior, Draw.io XML repair and round-tripping, Mermaid import, diagram layout/routing, reference-image reconstruction, direct edits, mask normalization, and frontend request shaping.

`npm run validate` runs lint, typecheck, tests, and an isolated build. The live OpenAI smoke test is opt-in with `LIVE_OPENAI_SMOKE=1`.

## Report and Paper Artifacts

Artifacts from the ASE Tools-style paper. Larger versions of paper figures are included here for easier inspection.

### System Workflow Figures

**Structured diagram-editing workflow** — prompt input → model-assisted reasoning → deterministic transformation → versioned Draw.io XML output:

![Structured diagram editing workflow](structured_diagram_editing_workflow.jpg)

**Image-editing workflow** — prompt and mask input → model-assisted image editing → artifact linking → versioned image output:

![Image editing workflow](image_editing_workflow.jpg)

### Demonstrated Workflow

**Reference input** — original Kubernetes cluster architecture diagram used as the reconstruction benchmark input:

![Kubernetes reference diagram](kubernetes_reference.png)

**Diagram reconstruction output** — final structured diagram after the prompt-guided edit sequence:

![Kubernetes final diagram result](kubernetes_final_result.png)

**Image editing output** — final result after sequential semantic edits to the Kubernetes diagram:

![Kubernetes image edit final](image_edit_kubernetes_final.png)

### Additional Report Materials

Report-ready descriptions for the system architecture diagram, internal data-flow diagram, session history/versioning diagram, evaluation workflow figure, evaluation plan, limitations, and future work are in:

- `docs/report-artifacts.md`

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

- The canvas is intentionally lighter than diagrams.net: no custom shape libraries, plugin registries, or full keyboard command parity.
- Exotic Draw.io features may still need repair after round-trip.
- Mermaid import covers flowchart/graph, sequence, class, and state diagrams.
- Gemini mask editing uses multimodal source+mask input; OpenAI remains stricter for pixel-protected edits.
- Diagram verification is conservative and does not reconstruct missing topology.
- The mask editor does not include semantic segmentation or AI-assisted region selection.
- Authentication, multi-user authorization, hosted object storage, and production observability are out of scope.

## Future Work

- Cloud artifact storage and authenticated multi-user sessions.
- Automated benchmark runners for XML compatibility, edit quality, latency, and recoverability.
- Advanced diagram-editor commands: multi-select alignment, distribute, snap guides, richer routing, custom shape libraries, and keyboard parity.
- Semantic image-mask selection, object-aware inpainting previews, and stronger provider-specific protection checks.
- Async job queues, cancellation, and progress streaming for long-running workflows.
