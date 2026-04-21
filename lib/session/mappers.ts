import type { Artifact, Version } from "@prisma/client";
import type { ArtifactPointer, SessionStep } from "@/types";

function parseJsonField<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

const stepTypeFromDb = (stepType: string): SessionStep["stepType"] => {
  if (stepType === "direct_edit") {
    return "direct-edit";
  }

  return stepType as SessionStep["stepType"];
};

const artifactTypeFromDb = (type: string): ArtifactPointer["artifactType"] => {
  return type as ArtifactPointer["artifactType"];
};

export function toSessionStep(version: Version & { artifacts: Artifact[] }): SessionStep {
  return {
    sessionId: version.sessionId,
    versionId: version.id,
    parentVersionId: version.parentVersionId,
    stepType: stepTypeFromDb(version.stepType),
    prompt: version.prompt,
    parsedIntent: parseJsonField(version.parsedIntent),
    editingAnalysis: parseJsonField(version.editingAnalysis),
    mode: version.mode as SessionStep["mode"],
    artifactPointers: version.artifacts.map((artifact) => ({
      artifactId: artifact.id,
      artifactType: artifactTypeFromDb(artifact.type),
      storagePath: artifact.storagePath
    })),
    previewReference: version.previewArtifactId,
    diagramModel: parseJsonField(version.diagramModel),
    timestamp: version.createdAt.toISOString()
  };
}
