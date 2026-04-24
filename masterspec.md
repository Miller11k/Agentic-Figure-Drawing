You are building a full-stack software system called:

# OpenAI-Native / Google-Native Stateful Diagram and Image Editing Platform

The goal is to implement a serious engineering prototype of a browser-based, stateful, multimodal editing environment that supports:

1. prompt-based image generation
2. prompt-based image editing
3. structured diagram import
4. prompt-guided diagram editing
5. direct diagram element editing
6. mask-based localized image editing
7. persistent session history with undo/revert
8. versioned, non-destructive workflows
9. multi-stage reasoning using multiple OpenAI API calls instead of external tools
10. strong observability and traceability for all reasoning/generation/editing stages

This project should preserve the same overall product capabilities and architecture as the existing concept, but with one major change:

- do not use ComfyUI
- do not use external local model orchestration tools
- do not use external diagram-generation model services
- do not use non-OpenAI or non-Google image pipelines
- use OpenAI API for all model-driven capabilities
- use multiple OpenAI API calls to simulate layered reasoning and structured multi-stage pipelines
- use OpenAI/Google image generation/editing for image workflows
- use OpenAI reasoning/text generation calls for diagram planning, XML generation, edit planning, validation, and repair

The result should feel like a robust, stateful application rather than a thin chatbot wrapper.

---

# 1. Product Goal

Build a browser-based application where a user can:

- upload Draw.io / diagrams.net XML diagrams
- visualize imported diagrams
- directly edit diagrams
- edit diagrams using natural language prompts
- generate diagrams from prompts by producing structured XML
- upload raster images
- generate images from prompts
- edit images from prompts
- apply localized edits using user-drawn masks
- switch between diagram mode and image mode
- inspect prompt interpretation and structured edit plans
- maintain persistent history for every session
- undo, revert, and inspect previous states
- download the current image or diagram
- inspect execution traces for OpenAI-backed stages

This is not a mockup. Build a coherent engineering prototype with realistic abstractions, typed models, useful logs, and code that can be extended later.

---

# 2. Report-Aligned Architectural Requirements

Design the application as a **multi-stage, stateful pipeline** with three major layers:

## A. User Interface Layer
Responsibilities:
- browser-based frontend
- upload diagrams and images
- enter natural language prompts
- draw masks on images
- perform direct diagram edits
- toggle between image mode and diagram mode
- inspect session history
- undo/revert previous states
- preview generated outputs
- download current outputs
- inspect parsed intent and execution summaries

## B. Processing / Analysis Layer
Responsibilities:
- route requests based on input type and processing mode
- parse prompts into structured edit intent
- parse diagram XML into internal diagram model
- analyze masks and region selection for image edits
- invoke multiple OpenAI API calls for layered reasoning
- produce edit plans before final output generation
- validate whether requested edits should be diagram-based or image-based
- maintain synchronization between prompt intent, structured state, and final output

## C. Structured Representation Layer
Responsibilities:
- store diagram models
- store parsed prompt intent
- store editing analysis results
- store session metadata
- store version history
- store image references, masks, and output metadata
- persist all states in a non-destructive history model

---

# 3. Stack Lock-In

Use the following stack unless there is a very strong engineering reason not to:

## Frontend
- Next.js 14+ (App Router)
- React
- TypeScript
- Tailwind CSS
- Zustand for client state
- TanStack Query for async/API state
- React Flow for diagram canvas and interactions if appropriate, or a custom SVG/canvas layer if necessary

## Backend
- Next.js route handlers or a dedicated Node.js/TypeScript backend colocated in the project
- TypeScript throughout
- Prisma + SQLite for prototype persistence
- local file storage for artifacts in prototype mode
- XML parsing/generation utilities
- strong schema validation using Zod

## Testing
- Vitest or Jest for unit tests
- Playwright for E2E/integration flows where useful

Use a local prototype architecture that is runnable by one developer on one machine.

---

# 4. OpenAI-Only Modeling Requirement

This is the most important constraint.

## Absolute Rules
- do not use ComfyUI
- do not use local model nodes/workflow graphs
- do not use external image generation/editing tools
- do not rely on third-party model orchestration frameworks
- do not offload diagram intelligence to non-OpenAI tools

## Instead, use OpenAI APIs in explicit multi-step pipelines

### For image generation
Use OpenAI image generation APIs.

### For image editing
Use OpenAI image editing APIs.
Support:
- prompt-only edits
- prompt + mask edits
- localized modifications
- regeneration of edited variants

### For diagram generation and editing
Use OpenAI text/reasoning APIs to:
- interpret user intent
- generate structured intermediate JSON edit plans
- generate diagram XML
- update existing XML
- validate XML
- repair malformed XML
- optionally summarize changes

### For “multi-layer reasoning”
Use multiple explicit OpenAI calls in sequence.

#### Diagram edit pipeline
1. Intent Extraction Call  
   Convert the user prompt into a structured `ParsedEditIntent`

2. Diagram Understanding Call  
   Analyze the current `DiagramModel` and identify candidate targets

3. Edit Planning Call  
   Produce an `EditingAnalysis` object that maps user intent to concrete operations

4. XML Transformation Call  
   Apply the edit plan and generate updated Draw.io-compatible XML

5. Validation / Repair Call  
   Check whether the XML is well-formed and structurally consistent, repairing if needed

#### Diagram generation pipeline
1. parse user prompt into a high-level diagram specification
2. generate an intermediate structured `DiagramSpec` JSON
3. convert `DiagramSpec` to `DiagramModel`
4. convert `DiagramModel` into Draw.io XML
5. validate XML
6. repair XML if needed
7. render preview

#### Image edit pipeline
1. parse prompt into structured image edit intent
2. determine whether the edit is global or localized
3. determine whether a mask is required or present
4. call OpenAI image edit or image generation API
5. store result in version history
6. optionally call a reasoning model to summarize changes or generate operation metadata

These stages should be explicit in the codebase and visible in logs/traces.

---

# 5. Core Functional Capabilities

Implement all of the following.

## A. Diagram Capabilities
- upload `.drawio`, `.xml`, or diagrams.net XML
- parse diagram XML into an internal model
- render imported diagram in the browser
- display diagram elements as selectable/editable objects
- support direct edits:
  - rename node
  - add node
  - delete node
  - move node
  - change style attributes
  - add connector
  - delete connector
  - reconnect edges
- support prompt-guided edits:
  - “rename API Gateway to Edge Router”
  - “add a database below the backend”
  - “connect auth service to user store”
  - “change all storage nodes to blue”
- generate new diagrams from prompts
- export/download updated XML
- keep XML synchronized with UI state

## B. Image Capabilities
- upload images
- generate images from prompts
- edit images from prompts
- apply mask-based edits
- let the user draw directly over the displayed image
- allow brush size control
- support undo for mask drawing
- correctly fit the image within the editor canvas
- allow download of edited/generated images

## C. Session / History Capabilities
- every action becomes a versioned history step
- each step stores:
  - original prompt
  - mode (image/diagram)
  - parsed edit intent
  - diagram model or image metadata
  - output artifact reference
  - timestamp
  - parent version id
- support:
  - undo
  - revert to arbitrary history step
  - branch-safe non-destructive editing
  - display of session timeline

---

# 6. Internal Data Models

Define strong TypeScript interfaces and backend schemas for:

## ParsedEditIntent
Fields should include:
- `mode`: `"diagram" | "image"`
- `actionType`: `"add" | "remove" | "rename" | "recolor" | "move" | "connect" | "disconnect" | "generate" | "edit"`
- `targetType`: `"node" | "edge" | "group" | "region" | "diagram" | "image"`
- `targetSelectors`: array of textual or structural selectors
- `attributes`: key/value map
- `spatialHints`
- `confidence`
- `rawPrompt`

## DiagramSpec
Fields should include:
- `title`
- `diagramType`
- `nodes`
- `edges`
- `groups`
- `layoutHints`
- `styleHints`

## DiagramModel
Fields should include:
- nodes
- edges
- groups
- layout metadata
- style metadata
- source XML
- normalized intermediate representation
- stable ids
- labels
- bounding boxes if available

## EditingAnalysis
Fields should include:
- parsed intent
- matched targets
- ambiguity flags
- selected operation plan
- validation notes
- fallback behavior
- execution route

## SessionStep
Fields should include:
- session id
- version id
- parent version id
- step type
- prompt
- parsed intent
- editing analysis
- mode
- artifact pointers
- preview reference
- timestamp

## ArtifactRecord
Fields should include:
- artifact id
- artifact type (`image`, `diagram_xml`, `preview`, `mask`)
- storage path
- mime type
- version id
- metadata

## OpenAITraceRecord
Fields should include:
- trace id
- session id
- version id
- pipeline name
- stage name
- input summary
- output summary
- started at
- ended at
- latency ms
- status
- repair applied flag
- model used
- token usage if applicable

---

# 7. Folder Structure Requirement

Start by proposing and then implementing a clean folder structure similar to:

- `app/`
- `components/`
- `features/diagram/`
- `features/image/`
- `features/session/`
- `lib/openai/`
- `lib/xml/`
- `lib/diagram/`
- `lib/storage/`
- `lib/session/`
- `lib/trace/`
- `prisma/`
- `public/`
- `tests/`
- `scripts/`

Break functionality into focused modules, not giant files.

---

# 8. OpenAI Service Layer

Create a dedicated backend service layer that encapsulates all OpenAI usage.

## Requirements
- centralized client setup
- environment-variable-based API key handling
- retry logic
- structured error handling
- typed inputs and outputs
- structured logs
- stage-level tracing
- utility wrappers for parsing structured JSON responses safely

## Provide methods like:
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

These should be composed into higher-order workflows, not called randomly from route handlers.

---

# 9. Observability / Tracing Requirement

Add structured logging and traceability for every OpenAI pipeline stage.

For every OpenAI-backed stage, log:
- session id
- version id
- pipeline name
- stage name
- artifact ids involved
- prompt or prompt summary
- parsed intent summary if available
- chosen route
- validation result
- repair result
- latency
- error status
- final artifact id

Expose this information in one or both of:
- backend logs
- a developer-facing trace panel in the UI

At minimum, traces should let me inspect:
- what stage ran
- why it ran
- what it produced
- whether repair/validation happened
- what final artifact resulted

---

# 10. Diagram Generation Requirements

When generating diagrams from prompts:

## Multi-stage flow
1. convert prompt to `DiagramSpec` JSON
2. convert `DiagramSpec` to `DiagramModel`
3. convert `DiagramModel` to Draw.io XML
4. validate XML structure
5. repair XML if needed
6. render preview

## Important requirements
- prefer deterministic layout heuristics after semantic structure is generated
- do not rely solely on the model for exact coordinates if layout logic can do better
- maintain stable ids when possible
- keep XML clean and consistent
- prioritize structured round-trip editability over flashy visuals

This is critical:
**Prioritize correctness and editability of diagram XML over visual sophistication.**
The main engineering value is preserving structured, round-trip editing.

---

# 11. Diagram Editing Requirements

When editing an existing diagram:

## Multi-stage flow
1. parse XML into `DiagramModel`
2. parse prompt into `ParsedEditIntent`
3. identify candidate targets in `DiagramModel`
4. produce `EditingAnalysis`
5. generate updated `DiagramModel` or transformed XML
6. validate and repair
7. save new version
8. re-render preview

## Editing quality requirements
- avoid full regeneration when localized structural edits are possible
- preserve unchanged elements whenever possible
- keep connector integrity intact
- keep labels and ids stable where possible
- maintain visual consistency after edits

---

# 12. Image Generation and Editing Requirements

Implement two distinct workflows.

## A. Prompt-Based Image Generation
- user enters a prompt
- backend calls OpenAI image generation
- result stored as current artifact
- new session version created

## B. Prompt-Based Image Editing
- user uploads image
- user optionally draws a mask
- user enters a prompt
- backend calls OpenAI image editing
- store edited result
- new session version created

## Image editor requirements
- image scales correctly within editor canvas
- mask aligns with visible image coordinates
- brush size slider
- undo/redo for mask strokes
- clear mask button
- download button for result

---

# 13. UI / UX Requirements

Build a clean interface with three main regions.

## Left panel
- upload controls
- mode toggle (diagram/image)
- prompt input
- action buttons
- download controls

## Center workspace
- diagram canvas or image editor
- direct edit interactions
- mask drawing overlay in image mode

## Right panel
- session history
- selected element inspector
- prompt interpretation preview
- parsed intent preview
- execution summary
- trace/debug panel
- version revert controls

## Key UX behaviors
- interface should feel stateful and iterative
- user should always understand:
  - what artifact is active
  - what mode they are in
  - what prompt was applied
  - what changed in the latest step
- show loading/progress states for each pipeline stage
- surface errors clearly, especially XML validation and repair events

---

# 14. API Endpoints

Create clear typed API routes such as:

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

All route payloads should be validated with Zod.

---

# 15. Direct Diagram Editing Requirements

Implement direct manipulation without requiring a prompt.

Support:
- click/select node
- edit label inline
- drag node
- edit style properties
- add/delete edges
- add new node
- remove node
- save direct edits through the same session/version infrastructure

Prompt-based edits and direct edits must share the same version history model.

---

# 16. Persistence Requirements

Use Prisma + SQLite for prototype persistence.

Persist:
- sessions
- versions
- prompts
- parsed edit intents
- editing analyses
- traces
- artifact metadata
- uploaded source files
- generated XML outputs
- generated images
- masks
- serialized structured representations

The schema should allow full reconstruction of session history.

---

# 17. Validation and Testing Requirements

Include meaningful tests.

## Unit tests
- prompt parsing wrappers
- XML parse/serialize logic
- version history logic
- mask coordinate transforms
- direct edit reducers
- route validation logic
- OpenAI response parsing helpers

## Integration tests
- diagram upload -> parse -> render -> edit -> export
- prompt -> parsed intent -> edit plan -> XML output
- image upload -> mask -> prompt -> edit result
- undo/revert workflows
- repeated session interactions

## Behavioral validation
Demonstrate:
- stable upload and rendering
- prompt capture and storage
- persistent version history
- successful end-to-end image generation/editing
- successful structured diagram import
- successful simple prompt-guided diagram editing
- successful direct diagram editing
- successful mask-based localized editing

---

# 18. Engineering Constraints and Design Philosophy

Design the implementation to reflect these priorities:

- deterministic structure handling where possible
- OpenAI for semantic reasoning and content generation
- avoid over-reliance on one-shot prompts
- prefer multi-step validation and repair
- preserve structure over flashy generation
- treat diagram XML as a first-class artifact
- maintain synchronization between:
  - prompt intent
  - structured representation
  - rendered output
  - session history

---

# 19. Required Deliverables

Generate the full runnable project.

Provide:
1. final folder structure
2. frontend code
3. backend code
4. OpenAI service layer
5. diagram parsing and XML generation utilities
6. session/version persistence logic
7. image editing/generation workflows
8. mask editor implementation
9. download/export functionality
10. example seed data / sample diagrams
11. tests
12. README with setup instructions
13. `.env.example`
14. notes on where OpenAI API calls occur and why
15. structured logging/tracing support
16. architecture and data-flow diagram descriptions

---

# 20. Architecture Diagram / Figure Deliverables

Also produce report-friendly descriptions for the following figures.

## A. System Architecture Diagram
Describe a figure showing:
- user input sources
- frontend interface
- routing/orchestration layer
- OpenAI service layer
- structured representation layer
- persistence/session store
- output artifacts

## B. Internal Data Flow Diagram
Describe a figure showing:
- prompt input -> ParsedEditIntent
- diagram XML -> DiagramModel
- image input + mask -> image edit request
- both feeding into EditingAnalysis
- then into XML transformation or image generation/editing
- then into artifact store and session history

## C. Session History Diagram
Describe a figure showing:
- versioned history nodes
- parent-child version relationships
- undo/revert flow
- stored prompt, model, and output per version

## D. Evaluation Workflow Figure
Describe a figure showing:
- diagram import
- prompt-guided edit
- direct edit
- mask-based image edit
- output + stored session step

Make these descriptions detailed enough that they can later be converted into actual report figures.

---

# 21. Evaluation Plan Deliverable

Also generate a short evaluation plan aligned with the prototype workflows.

Include:
- functional tests for upload/render/edit/export
- session persistence validation
- XML round-trip validation
- direct edit consistency checks
- prompt-guided diagram edit success checks
- localized image edit checks
- latency and trace monitoring for multi-stage OpenAI calls

---

# 22. Codex Output Style Requirements

Do not just dump disconnected files.

Follow this build order:

## Step 1
Propose the final folder structure and explain the main modules briefly.

## Step 2
Define the main data models and Prisma schema.

## Step 3
Implement storage/session/history infrastructure.

## Step 4
Implement OpenAI service abstractions and trace/logging.

## Step 5
Implement XML parsing, diagram model conversion, and XML generation/repair pipeline.

## Step 6
Implement backend API routes.

## Step 7
Implement frontend UI shell and layout.

## Step 8
Implement diagram canvas/direct editing.

## Step 9
Implement image editor and mask tooling.

## Step 10
Wire full end-to-end workflows.

## Step 11
Add tests.

## Step 12
Write README, `.env.example`, and report-figure descriptions.

At each step, ensure files are complete and consistent with earlier files.

---

# 23. Code Quality Requirements

- strong typing throughout
- clean separation of concerns
- no giant monolithic files
- reusable abstractions
- good names
- minimal dead code
- practical comments only
- defensive error handling
- graceful fallback when model output is malformed
- isolate compatibility-sensitive logic for Draw.io XML

---

# 24. Important Non-Goals

Do not:
- integrate ComfyUI
- build around external local image workflow managers
- depend on a non-OpenAI model stack
- reduce the system to a simple chat interface
- skip the session/versioning architecture
- fake important functionality unless clearly marked as a stub

---

# 25. Final Instruction

Generate this as a serious prototype implementation of a **stateful multimodal editing platform** where **OpenAI APIs are the backbone for every reasoning, generation, editing, validation, and repair step**.

Preserve the spirit of:
- structured diagram parsing
- prompt-guided editing
- multimodal workflows
- session-based state management
- non-destructive versioned history
- iterative editing

But replace all prior model/workflow assumptions with **OpenAI-native multi-call orchestration**.

Start now with:
1. final folder structure
2. module breakdown
3. data models
4. Prisma schema
5. then continue implementation in the required build order