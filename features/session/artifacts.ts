import type { ApiArtifact, SessionHistoryResponse } from "./types";
import type { EditorMode } from "@/types";

export function selectVersionArtifact(
  history: SessionHistoryResponse,
  versionId: string,
  mode: EditorMode
): ApiArtifact | undefined {
  const step = history.steps.find((candidate) => candidate.versionId === versionId);
  const versionArtifacts = history.artifacts.filter((artifact) => artifact.versionId === versionId);

  if (step?.previewReference) {
    const preview = history.artifacts.find((artifact) => artifact.id === step.previewReference);
    if (preview) return preview;
  }

  if (mode === "image") {
    return (
      versionArtifacts.find((artifact) => artifact.type === "image") ??
      versionArtifacts.find((artifact) => artifact.type === "source") ??
      versionArtifacts.at(-1)
    );
  }

  return (
    versionArtifacts.find((artifact) => artifact.type === "diagram_xml") ??
    versionArtifacts.find((artifact) => artifact.type === "preview") ??
    versionArtifacts.at(-1)
  );
}
