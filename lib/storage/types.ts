import type { ArtifactType } from "@/types";

export interface StoreArtifactInput {
  sessionId: string;
  versionId: string;
  artifactType: ArtifactType;
  fileName: string;
  mimeType: string;
  data: Buffer;
  metadata?: Record<string, unknown>;
}

export interface StoredArtifact {
  artifactType: ArtifactType;
  storagePath: string;
  absolutePath: string;
  mimeType: string;
  bytes: number;
  checksum: string;
  metadata: Record<string, unknown>;
}

export interface ArtifactStorage {
  store(input: StoreArtifactInput): Promise<StoredArtifact>;
  read(storagePath: string): Promise<Buffer>;
  remove(storagePath: string): Promise<void>;
}
