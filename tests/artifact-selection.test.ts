import { describe, expect, it } from "vitest";
import { selectVersionArtifact } from "../features/session/artifacts";
import type { SessionHistoryResponse } from "../features/session/types";

function history(): SessionHistoryResponse {
  return {
    id: "session_1",
    title: "Test",
    currentVersionId: "version_1",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    steps: [
      {
        sessionId: "session_1",
        versionId: "version_1",
        parentVersionId: null,
        stepType: "prompt",
        mode: "image",
        artifactPointers: [],
        timestamp: new Date(0).toISOString()
      }
    ],
    artifacts: [
      {
        id: "source_1",
        sessionId: "session_1",
        versionId: "version_1",
        type: "source",
        storagePath: "source.png",
        mimeType: "image/png",
        createdAt: new Date(0).toISOString()
      },
      {
        id: "mask_1",
        sessionId: "session_1",
        versionId: "version_1",
        type: "mask",
        storagePath: "mask.png",
        mimeType: "image/png",
        createdAt: new Date(0).toISOString()
      },
      {
        id: "edited_1",
        sessionId: "session_1",
        versionId: "version_1",
        type: "image",
        storagePath: "edited.png",
        mimeType: "image/png",
        createdAt: new Date(0).toISOString()
      }
    ],
    traces: []
  };
}

describe("session artifact selection", () => {
  it("prefers edited image artifacts over source and mask artifacts", () => {
    expect(selectVersionArtifact(history(), "version_1", "image")?.id).toBe("edited_1");
  });

  it("falls back to the uploaded source artifact when no edited image exists", () => {
    const sourceOnly = history();
    sourceOnly.artifacts = sourceOnly.artifacts.filter((artifact) => artifact.type !== "image");

    expect(selectVersionArtifact(sourceOnly, "version_1", "image")?.id).toBe("source_1");
  });

  it("honors explicit preview references", () => {
    const withPreview = history();
    withPreview.steps[0].previewReference = "mask_1";

    expect(selectVersionArtifact(withPreview, "version_1", "image")?.id).toBe("mask_1");
  });
});
