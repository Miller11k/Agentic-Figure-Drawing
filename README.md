# OpenAI-Native Stateful Diagram and Image Editing Platform

This project is a browser-based prototype for stateful diagram and image editing. It is designed around versioned sessions, persistent artifacts, structured diagram models, and explicit OpenAI-backed reasoning/generation/editing workflows.

Phase 1 establishes the foundation only. It does not yet implement the full diagram editor, image editor, or OpenAI workflow calls.

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

- `GET /api/health` - basic service health check
- `POST /api/session/create` - create a session and initial version
- `GET /api/session/:sessionId` - retrieve session history, artifacts, and traces
- `POST /api/session/:sessionId/revert` - move the active session pointer to an earlier version
- `GET /api/traces/:sessionId` - list OpenAI pipeline traces for a session

## Persistence Model

The Prisma schema persists:

- sessions
- version history with parent-child version links
- artifact metadata for images, diagram XML, previews, masks, and uploaded sources
- OpenAI trace records
- prompt/edit metadata including parsed intent and editing analysis JSON

Local artifact bytes are stored through `lib/storage` under `ARTIFACT_STORAGE_ROOT`, which defaults to `./public/artifacts`.

## Current Limitations

- Full OpenAI workflows are intentionally not implemented in Phase 1.
- Diagram XML parsing is limited to a lightweight shape validator and empty model factory.
- The frontend is a scaffold page, not the final editor UI.
- Direct diagram editing, image editing, mask drawing, and download/export flows are reserved for later phases.

## Phase 2 Direction

Phase 2 should build on this foundation by implementing the first real OpenAI-native workflow slices:

- diagram XML import into `DiagramModel`
- prompt-to-`ParsedEditIntent` through the OpenAI service layer
- trace-wrapped OpenAI calls for each pipeline stage
- deterministic diagram model updates where possible
- Draw.io XML validation/repair
- minimal frontend session creation and history display

Keep all model-backed behavior inside `lib/openai` workflows and persist every meaningful output through the session/version infrastructure.
