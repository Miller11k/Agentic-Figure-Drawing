import { describe, expect, it } from "vitest";
import { artifactDownloadUrl } from "../features/session/api";
import { sanitizeHistoryPrompt } from "../features/session/prompts";
import { useEditorStore } from "../features/session/store";

describe("frontend session state", () => {
  it("tracks the active session, mode, and artifact", () => {
    useEditorStore.getState().clearWorkspace();
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

  it("tracks selected diagram elements and pending edge source", () => {
    useEditorStore.getState().clearWorkspace();
    useEditorStore.getState().selectElement({ type: "node", id: "node_a" });
    useEditorStore.getState().setPendingEdgeSource("node_a");

    expect(useEditorStore.getState().selectedElement).toEqual({ type: "node", id: "node_a" });
    expect(useEditorStore.getState().pendingEdgeSourceId).toBe("node_a");
  });

  it("uses OpenAI as the safe default image provider", () => {
    useEditorStore.getState().clearWorkspace();

    expect(useEditorStore.getState().imageProvider).toBe("openai");
  });

  it("removes internal localization instructions from history prompts", () => {
    expect(
      sanitizeHistoryPrompt(
        [
          "Make the logo blue.",
          "Strict localized edit constraint: only change pixels inside the transparent mask area.",
          "Preserve all unmasked / opaque-mask regions exactly, including background."
        ].join("\n")
      )
    ).toBe("Make the logo blue.");
  });
});
