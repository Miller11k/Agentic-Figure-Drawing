# Session Feature

Frontend session state, typed API helpers, artifact selection, and history UI.

SAGE stores meaningful operations as immutable versions. The current-version pointer can move backward through `POST /api/session/:id/revert`, and selecting a history card restores the diagram or image state for that version. Lightweight editor state persists in browser storage for refresh recovery.

Backend persistence helpers live in `lib/session`; shared API response types live in `features/session/types.ts`.
