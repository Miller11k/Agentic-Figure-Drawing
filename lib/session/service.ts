import { prisma } from "@/lib/db/prisma";
import type { ArtifactType, EditorMode, SessionStepType } from "@/types";

type SerializableJson = unknown;

export interface CreateSessionInput {
  title?: string;
  initialMode?: EditorMode;
}

export interface CreateVersionStepInput {
  sessionId: string;
  parentVersionId?: string | null;
  stepType: SessionStepType;
  mode: EditorMode;
  prompt?: string | null;
  parsedIntent?: SerializableJson | null;
  editingAnalysis?: SerializableJson | null;
  diagramModel?: SerializableJson | null;
  imageMetadata?: SerializableJson | null;
  metadata?: SerializableJson;
}

export interface AttachArtifactInput {
  sessionId: string;
  versionId: string;
  artifactType: ArtifactType;
  storagePath: string;
  mimeType: string;
  bytes?: number;
  checksum?: string;
  metadata?: SerializableJson;
}

export interface UpdateVersionStructuredStateInput {
  versionId: string;
  parsedIntent?: SerializableJson | null;
  editingAnalysis?: SerializableJson | null;
  diagramModel?: SerializableJson | null;
  imageMetadata?: SerializableJson | null;
  metadata?: SerializableJson | null;
  previewArtifactId?: string | null;
}

function stepTypeToDb(stepType: SessionStepType) {
  return stepType === "direct-edit" ? "direct_edit" : stepType;
}

function serializeJson(value: SerializableJson | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return JSON.stringify(value);
}

export async function createSession(input: CreateSessionInput = {}) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.session.create({
      data: {
        title: input.title ?? "Untitled session"
      }
    });

    const version = await tx.version.create({
      data: {
        sessionId: session.id,
        stepType: "create",
        mode: input.initialMode ?? "diagram",
        metadata: serializeJson({
          createdBy: "session-service",
          note: "Initial empty session version"
        })
      }
    });

    const updatedSession = await tx.session.update({
      where: { id: session.id },
      data: { currentVersionId: version.id }
    });

    return { session: updatedSession, initialVersion: version };
  });
}

export async function createVersionStep(input: CreateVersionStepInput) {
  return prisma.$transaction(async (tx) => {
    const parentVersionId =
      input.parentVersionId ??
      (
        await tx.session.findUniqueOrThrow({
          where: { id: input.sessionId },
          select: { currentVersionId: true }
        })
      ).currentVersionId;

    const version = await tx.version.create({
      data: {
        sessionId: input.sessionId,
        parentVersionId,
        stepType: stepTypeToDb(input.stepType),
        mode: input.mode,
        prompt: input.prompt,
        parsedIntent: serializeJson(input.parsedIntent),
        editingAnalysis: serializeJson(input.editingAnalysis),
        diagramModel: serializeJson(input.diagramModel),
        imageMetadata: serializeJson(input.imageMetadata),
        metadata: serializeJson(input.metadata)
      }
    });

    await tx.session.update({
      where: { id: input.sessionId },
      data: { currentVersionId: version.id }
    });

    if (input.prompt) {
      await tx.promptEditMetadata.create({
        data: {
          sessionId: input.sessionId,
          versionId: version.id,
          rawPrompt: input.prompt,
          mode: input.mode,
          parsedIntent: serializeJson(input.parsedIntent),
          editingAnalysis: serializeJson(input.editingAnalysis),
          status: "success"
        }
      });
    }

    return version;
  });
}

export async function attachArtifact(input: AttachArtifactInput) {
  return prisma.artifact.create({
    data: {
      sessionId: input.sessionId,
      versionId: input.versionId,
      type: input.artifactType,
      storagePath: input.storagePath,
      mimeType: input.mimeType,
      bytes: input.bytes,
      checksum: input.checksum,
      metadata: serializeJson(input.metadata)
    }
  });
}

export async function updateVersionStructuredState(input: UpdateVersionStructuredStateInput) {
  return prisma.version.update({
    where: { id: input.versionId },
    data: {
      parsedIntent: serializeJson(input.parsedIntent),
      editingAnalysis: serializeJson(input.editingAnalysis),
      diagramModel: serializeJson(input.diagramModel),
      imageMetadata: serializeJson(input.imageMetadata),
      metadata: serializeJson(input.metadata),
      previewArtifactId: input.previewArtifactId ?? undefined
    }
  });
}

export async function getSessionHistory(sessionId: string) {
  return prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      versions: {
        orderBy: { createdAt: "asc" },
        include: {
          artifacts: true,
          traces: { orderBy: { startedAt: "asc" } },
          promptMetadata: { orderBy: { createdAt: "asc" } }
        }
      },
      artifacts: { orderBy: { createdAt: "asc" } },
      traces: { orderBy: { startedAt: "asc" } }
    }
  });
}

export async function revertSessionToVersion(sessionId: string, versionId: string) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { currentVersionId: true }
    });
    const target = await tx.version.findFirstOrThrow({
      where: { id: versionId, sessionId }
    });

    const revertVersion = await tx.version.create({
      data: {
        sessionId,
        parentVersionId: session.currentVersionId,
        stepType: "revert",
        mode: target.mode,
        prompt: target.prompt,
        parsedIntent: target.parsedIntent,
        editingAnalysis: target.editingAnalysis,
        diagramModel: target.diagramModel,
        imageMetadata: target.imageMetadata,
        metadata: serializeJson({
          revertedToVersionId: target.id,
          note: "Non-destructive metadata revert to an earlier version."
        }),
        previewArtifactId: target.previewArtifactId
      }
    });

    await tx.session.update({
      where: { id: sessionId },
      data: { currentVersionId: revertVersion.id }
    });

    return revertVersion;
  });
}
