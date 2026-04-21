# OpenAI-Native Stateful Diagram and Image Editing Platform

This project is a browser-based prototype for stateful diagram and image editing. It is designed around versioned sessions, persistent artifacts, structured diagram models, and explicit OpenAI-backed reasoning/generation/editing workflows.

Phase 1 established the persistence and project foundation. Phase 2 added the OpenAI service layer, trace-wrapped stage execution, and orchestration skeletons for the multi-stage workflows. Phase 3 added the structured Draw.io XML pipeline for import, normalization, deterministic model-to-XML output, and repair-ready validation. Phase 4 connected the backend API layer. Phase 5 added the main three-panel frontend shell. Phase 6 adds interactive direct diagram editing.

## Tech Stack

- Next.js 14 App Router
- React and TypeScript
- Tailwind CSS
- Prisma with SQLite for local prototype persistence
- Zod for request/response validation
- Zustand and TanStack Query reserved for frontend state work
- OpenAI API as the only model provider for future reasoning, generation, editing, validation, and repair workflows

## Folder Structure

- `app/` - Next.js pages and route handlers
- `components/` - shared UI components
- `features/diagram/` - diagram feature modules and future UI/workflow code
- `features/image/` - image feature modules and future UI/workflow code
- `features/session/` - session timeline/state feature modules
- `lib/openai/` - centralized OpenAI client and typed workflow service boundary
- `lib/workflows/` - diagram and image pipeline orchestration composed from explicit stages
- `lib/xml/` - Draw.io / diagrams.net XML utilities
- `lib/diagram/` - structured diagram model helpers
- `lib/storage/` - local artifact storage abstraction and persistence helpers
- `lib/session/` - session, version, artifact metadata, history, and revert services
- `lib/trace/` - OpenAI pipeline trace persistence helpers
- `lib/validation/` - Zod schemas for API and workflow shapes
- `prisma/` - Prisma schema and SQLite migrations
- `public/` - static assets and local artifact output root
- `tests/` - unit tests
- `scripts/` - future maintenance or seed scripts

## Setup

Install dependencies:

```bash
npm install
```

Create local environment config:

```bash
cp .env.example .env
```

Set `OPENAI_API_KEY` before running any OpenAI-backed workflow. Phase 1 routes do not call OpenAI yet.

Generate the Prisma client:

```bash
npm run prisma:generate
```

Run the initial SQLite migration:

```bash
npm run prisma:migrate -- --name init
```

Start the app:

```bash
npm run dev
```

The app runs at `http://localhost:3000` by default.

## Phase 1 API Routes

## API Routes

- `GET /api/health` - basic service health check
- `POST /api/session/create` - create a session and initial version
- `GET /api/session/:sessionId` - retrieve session history, artifacts, and traces
- `POST /api/session/:sessionId/revert` - create a non-destructive revert version pointing at an earlier version's metadata
- `POST /api/diagram/import` - parse Draw.io XML, persist source XML, and store a normalized `DiagramModel`
- `POST /api/diagram/generate` - run the diagram generation workflow
- `POST /api/diagram/edit` - run prompt-guided diagram editing
- `POST /api/diagram/direct-edit` - apply deterministic direct edit operations to a `DiagramModel`
- `POST /api/image/generate` - run OpenAI-backed image generation
- `POST /api/image/edit` - run OpenAI-backed image editing with optional base64 mask
- `POST /api/upload` - persist a generic uploaded artifact using JSON/base64 or multipart form data
- `GET /api/artifact/:artifactId` - retrieve artifact metadata
- `GET /api/download/:artifactId` - download artifact bytes
- `GET /api/traces/:sessionId` - list OpenAI pipeline traces for a session

## Persistence Model

The Prisma schema persists:

- sessions
- version history with parent-child version links
- artifact metadata for images, diagram XML, previews, masks, and uploaded sources
- OpenAI trace records
- prompt/edit metadata including parsed intent and editing analysis JSON

Local artifact bytes are stored through `lib/storage` under `ARTIFACT_STORAGE_ROOT`, which defaults to `./public/artifacts`.

## OpenAI Workflow Layer

All model-backed operations are isolated behind `lib/openai`. Route handlers and UI code should call workflow services rather than the OpenAI SDK directly.

The current service methods are:

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

The orchestration layer in `lib/workflows` composes these into:

- diagram generation
- diagram editing
- image generation
- image editing

Each OpenAI-backed stage is intended to write a trace record with session id, version id, pipeline name, stage name, input/output summaries, model name, status, and timing.

## Current Limitations

- OpenAI wrappers are implemented, but most workflows still need real UI/API route entry points.
- Diagram XML support targets a practical uncompressed Draw.io subset, not every diagrams.net feature.
- The frontend is a scaffold page, not the final editor UI.
- Direct diagram editing, image editing, mask drawing, and download/export flows are reserved for later phases.

## Phase 4 Direction

Phase 5 should build on this foundation by implementing the first user-facing workflow slices:

- a browser UI for session creation and session history
- diagram XML upload/import controls
- prompt controls wired to diagram and image generation/editing routes
- a basic diagram preview using the normalized `DiagramModel`
- artifact download buttons
- trace/debug panel rendering `/api/traces/:sessionId`

Keep all model-backed behavior inside `lib/openai` workflows and persist every meaningful output through the session/version infrastructure.

## Structured Diagram XML Pipeline

Draw.io XML is treated as a first-class artifact. The current deterministic pipeline is:

1. Import `.drawio` / diagrams.net XML.
2. Parse common `mxCell` records from `<mxGraphModel><root>`.
3. Normalize vertices into `DiagramModel.nodes`.
4. Normalize edges into `DiagramModel.edges`.
5. Detect practical groups from swimlane/container-like vertex cells or parent-child structure.
6. Preserve ids, labels, raw style strings, parent/group links, connector endpoints, and geometry where available.
7. Convert `DiagramSpec` into `DiagramModel` with deterministic stable ids and grid placement.
8. Serialize `DiagramModel` back to Draw.io-compatible XML.
9. Validate root/layer cells and connector references, with lightweight repair for missing root/layer cells.

The sample diagram at `public/samples/basic.drawio` is used by the round-trip tests.

Compatibility limits:

- The parser targets uncompressed Draw.io XML containing `mxGraphModel` and `mxCell` elements.
- Compressed diagrams.net payloads are not decoded yet.
- Advanced shapes, nested geometry points, edge waypoints, pages, custom libraries, and style semantics are preserved only as raw style/metadata where practical.
- Group detection is heuristic and focused on swimlanes, containers, and parent-child relationships.
- The serializer emits clean prototype-friendly XML rather than byte-for-byte preserving the original file.

## Frontend Shell

The home page now renders a stateful editing shell with:

- left control panel for session creation, mode toggle, prompt entry, diagram XML import, image upload/edit, and artifact download
- center workspace that previews normalized `DiagramModel` content as SVG or displays the active image artifact
- right inspector panel with session history, revert actions, active artifact metadata, parsed intent, execution summary, and trace/debug entries

Frontend state is split across:

- `features/session/api.ts` for typed route integration
- `features/session/store.ts` for active editor state with Zustand
- `components/providers.tsx` for TanStack Query
- `components/EditorShell.tsx` for layout composition

Advanced diagram direct manipulation and mask drawing are intentionally left for later phases.

## Interactive Diagram Editing

The diagram workspace supports structured direct edits against `DiagramModel`:

- select nodes, edges, and groups
- drag nodes and persist new coordinates through `/api/diagram/direct-edit`
- edit node labels inline
- add nodes
- remove selected nodes or edges
- update selected node style using swatches
- create edges by selecting a source node and clicking a target
- reconnect selected edge source or target
- inspect selected element data in the right panel

Each direct edit creates a new session version and persisted Draw.io XML artifact. Prompt-guided diagram editing remains available from the left prompt panel and shares the same session/version history.
