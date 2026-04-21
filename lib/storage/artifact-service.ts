import { attachArtifact } from "@/lib/session";
import type { ArtifactType } from "@/types";
import { artifactStorage } from "./local-artifact-storage";

export interface PersistArtifactInput {
  sessionId: string;
  versionId: string;
  artifactType: ArtifactType;
  fileName: string;
  mimeType: string;
  data: Buffer;
  metadata?: unknown;
}

export async function persistArtifactForVersion(input: PersistArtifactInput) {
  const stored = await artifactStorage.store({
    sessionId: input.sessionId,
    versionId: input.versionId,
    artifactType: input.artifactType,
    fileName: input.fileName,
    mimeType: input.mimeType,
    data: input.data,
    metadata: (input.metadata as Record<string, unknown> | undefined) ?? {}
  });

  return attachArtifact({
    sessionId: input.sessionId,
    versionId: input.versionId,
    artifactType: stored.artifactType,
    storagePath: stored.storagePath,
    mimeType: stored.mimeType,
    bytes: stored.bytes,
    checksum: stored.checksum,
    metadata: input.metadata
  });
}
