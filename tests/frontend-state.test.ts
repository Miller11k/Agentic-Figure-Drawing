import { describe, expect, it } from "vitest";
import { artifactDownloadUrl } from "../features/session/api";
import { useEditorStore } from "../features/session/store";

describe("frontend session state", () => {
  it("tracks the active session, mode, and artifact", () => {
    useEditorStore.getState().setMode("image");
    useEditorStore.getState().setActiveSession("session_1", "version_1");
    useEditorStore.getState().setActiveArtifact("artifact_1");

    expect(useEditorStore.getState().mode).toBe("image");
    expect(useEditorStore.getState().activeSessionId).toBe("session_1");
    expect(useEditorStore.getState().activeVersionId).toBe("version_1");
    expect(useEditorStore.getState().activeArtifactId).toBe("artifact_1");
  });

  it("builds artifact download URLs", () => {
    expect(artifactDownloadUrl("artifact_123")).toBe("/api/download/artifact_123");
  });
});
