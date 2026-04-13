from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any, Optional

from PIL import Image, UnidentifiedImageError


class SessionStoreError(Exception):
    """Base exception for session persistence failures."""


class SessionNotFoundError(SessionStoreError):
    """Raised when a requested session does not exist."""


class UndoNotAvailableError(SessionStoreError):
    """Raised when a session cannot be undone any further."""


class HistoryVersionNotFoundError(SessionStoreError):
    """Raised when a requested history version does not exist."""


class InvalidImageError(SessionStoreError):
    """Raised when uploaded bytes are not a supported raster image."""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class FileSessionStore:
    """Persists session metadata and images on the local filesystem."""

    def __init__(self, root_dir: str | Path):
        self.root_dir = Path(root_dir)
        self.root_dir.mkdir(parents=True, exist_ok=True)

    def create_session(
        self,
        *,
        generated_image_bytes: bytes,
        prompt: str,
        operation: str,
        parameters: Optional[dict[str, Any]] = None,
        source: str = "prompt",
        original_image_bytes: Optional[bytes] = None,
    ) -> dict[str, Any]:
        session_id = uuid.uuid4().hex
        session_dir = self._session_dir(session_id)
        session_dir.mkdir(parents=True, exist_ok=False)

        original_png = self._to_png_bytes(original_image_bytes or generated_image_bytes)
        generated_png = self._to_png_bytes(generated_image_bytes)

        original_filename = "original.png"
        current_filename = "step_000.png"
        self._write_image(session_dir / original_filename, original_png)
        self._write_image(session_dir / current_filename, generated_png)

        timestamp = _utc_now()
        session = {
            "session_id": session_id,
            "created_at": timestamp,
            "updated_at": timestamp,
            "original_image": original_filename,
            "current_image": current_filename,
            "current_index": 0,
            "edit_history": [
                {
                    "version": 0,
                    "prompt": prompt,
                    "operation": operation,
                    "source": source,
                    "timestamp": timestamp,
                    "image_filename": current_filename,
                    "parameters": parameters or {},
                }
            ],
        }
        self._write_session(session)
        return session

    def get_session(self, session_id: str) -> dict[str, Any]:
        metadata_path = self._metadata_path(session_id)
        if not metadata_path.exists():
            raise SessionNotFoundError(f"Session '{session_id}' was not found.")
        return json.loads(metadata_path.read_text(encoding="utf-8"))

    def append_edit(
        self,
        session_id: str,
        *,
        image_bytes: bytes,
        prompt: str,
        operation: str = "edit",
        parameters: Optional[dict[str, Any]] = None,
        source: str = "session",
    ) -> dict[str, Any]:
        session = self.get_session(session_id)

        if session["current_index"] < len(session["edit_history"]) - 1:
            session["edit_history"] = session["edit_history"][: session["current_index"] + 1]

        next_version = len(session["edit_history"])
        filename = f"step_{next_version:03d}.png"
        self._write_image(self._session_dir(session_id) / filename, self._to_png_bytes(image_bytes))

        timestamp = _utc_now()
        session["edit_history"].append(
            {
                "version": next_version,
                "prompt": prompt,
                "operation": operation,
                "source": source,
                "timestamp": timestamp,
                "image_filename": filename,
                "parameters": parameters or {},
            }
        )
        session["current_index"] = next_version
        session["current_image"] = filename
        session["updated_at"] = timestamp
        self._write_session(session)
        return session

    def write_entry_image_asset(
        self,
        session_id: str,
        version: int,
        *,
        suffix: str,
        image_bytes: bytes,
    ) -> str:
        session = self.get_session(session_id)
        entry = next((candidate for candidate in session["edit_history"] if candidate["version"] == version), None)
        if entry is None:
            raise HistoryVersionNotFoundError(
                f"Version '{version}' was not found for session '{session_id}'."
            )

        base_name = Path(entry["image_filename"]).stem
        filename = f"{base_name}.{suffix}.png"
        self._write_image(self._session_dir(session_id) / filename, self._to_png_bytes(image_bytes))
        return filename

    def update_entry_parameters(
        self,
        session_id: str,
        version: int,
        parameter_patch: dict[str, Any],
    ) -> dict[str, Any]:
        session = self.get_session(session_id)
        entry = next((candidate for candidate in session["edit_history"] if candidate["version"] == version), None)
        if entry is None:
            raise HistoryVersionNotFoundError(
                f"Version '{version}' was not found for session '{session_id}'."
            )

        current_parameters = dict(entry.get("parameters", {}))
        current_parameters.update(parameter_patch)
        entry["parameters"] = current_parameters
        session["updated_at"] = _utc_now()
        self._write_session(session)
        return session

    def undo(self, session_id: str) -> dict[str, Any]:
        session = self.get_session(session_id)
        if session["current_index"] == 0:
            raise UndoNotAvailableError("This session is already at its original image.")

        previous_version = session["edit_history"][session["current_index"] - 1]["version"]
        return self.revert_to_version(session_id, previous_version)

    def revert_to_version(self, session_id: str, version: int) -> dict[str, Any]:
        session = self.get_session(session_id)

        target_index = next(
            (index for index, entry in enumerate(session["edit_history"]) if entry["version"] == version),
            None,
        )
        if target_index is None:
            raise HistoryVersionNotFoundError(
                f"Version '{version}' was not found for session '{session_id}'."
            )

        if session["current_index"] == target_index:
            return session

        session["current_index"] = target_index
        session["current_image"] = session["edit_history"][target_index]["image_filename"]
        session["updated_at"] = _utc_now()
        self._write_session(session)
        return session

    def get_current_image_bytes(self, session_id: str) -> bytes:
        session = self.get_session(session_id)
        return self.get_image_path(session_id, session["current_image"]).read_bytes()

    def get_image_path(self, session_id: str, filename: str) -> Path:
        session_dir = self._session_dir(session_id).resolve()
        image_path = (session_dir / filename).resolve()
        if session_dir not in image_path.parents and image_path != session_dir:
            raise SessionNotFoundError("Invalid image path requested.")
        if not image_path.exists():
            raise SessionNotFoundError(f"Image '{filename}' was not found for session '{session_id}'.")
        return image_path

    def _metadata_path(self, session_id: str) -> Path:
        return self._session_dir(session_id) / "session.json"

    def _session_dir(self, session_id: str) -> Path:
        return self.root_dir / session_id

    def _write_image(self, path: Path, image_bytes: bytes) -> None:
        path.write_bytes(image_bytes)

    def _write_session(self, session: dict[str, Any]) -> None:
        self._metadata_path(session["session_id"]).write_text(
            json.dumps(session, indent=2),
            encoding="utf-8",
        )

    def _to_png_bytes(self, image_bytes: bytes) -> bytes:
        try:
            with Image.open(BytesIO(image_bytes)) as image:
                image.load()
                mode = "RGBA" if "A" in image.getbands() else "RGB"
                converted = image.convert(mode)
                buffer = BytesIO()
                converted.save(buffer, format="PNG")
                return buffer.getvalue()
        except UnidentifiedImageError as exc:
            raise InvalidImageError(
                "Uploaded content is not a supported raster image. Use PNG, JPG, or WebP."
            ) from exc
