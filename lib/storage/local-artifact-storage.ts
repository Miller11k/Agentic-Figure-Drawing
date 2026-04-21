import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ArtifactStorage, StoreArtifactInput, StoredArtifact } from "./types";

const DEFAULT_STORAGE_ROOT = "./public/artifacts";

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export class LocalArtifactStorage implements ArtifactStorage {
  constructor(private readonly root = process.env.ARTIFACT_STORAGE_ROOT ?? DEFAULT_STORAGE_ROOT) {}

  async store(input: StoreArtifactInput): Promise<StoredArtifact> {
    const safeFileName = sanitizeFileName(input.fileName);
    const relativePath = path.join(input.sessionId, input.versionId, input.artifactType, safeFileName);
    const absolutePath = path.resolve(this.root, relativePath);
    const checksum = createHash("sha256").update(input.data).digest("hex");

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.data);

    return {
      artifactType: input.artifactType,
      storagePath: relativePath.replaceAll("\\", "/"),
      absolutePath,
      mimeType: input.mimeType,
      bytes: input.data.byteLength,
      checksum,
      metadata: input.metadata ?? {}
    };
  }

  async read(storagePath: string): Promise<Buffer> {
    return readFile(path.resolve(this.root, storagePath));
  }

  async remove(storagePath: string): Promise<void> {
    await rm(path.resolve(this.root, storagePath), { force: true });
  }
}

export const artifactStorage = new LocalArtifactStorage();
