# Session Feature

This feature boundary contains the frontend session state, typed API helpers, artifact selection utilities, and history UI.

The app stores meaningful operations as immutable versions. The current-version pointer can move backward through `POST /api/session/:id/revert`, and clicking a history card in the UI restores the full diagram or image state for that version. Lightweight editor state is persisted in browser storage so refreshes can recover the active workspace when storage is available.

Backend persistence helpers live in `lib/session`; shared API response types live in `features/session/types.ts`.
