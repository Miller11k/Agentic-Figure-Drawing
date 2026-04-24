"use client";

import type {
  CreateSessionResponse,
  DiagramEditResult,
  DiagramGenerateResult,
  DiagramImportResult,
  ImageWorkflowResult,
  SessionHistoryResponse,
  UploadArtifactResult
} from "./types";
import type { DiagramModel, DirectDiagramEditOperation, EditorMode } from "@/types";
import { buildImageEditPayload } from "@/lib/image/mask";
import type { ImageGenerationProvider } from "@/lib/google";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body?.error?.message ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return body as T;
}

export function createSession(title = "Untitled session", initialMode: EditorMode = "diagram") {
  return requestJson<CreateSessionResponse>("/api/session/create", {
    method: "POST",
    body: JSON.stringify({ title, initialMode })
  });
}

export function getSessionHistory(sessionId: string) {
  return requestJson<SessionHistoryResponse>(`/api/session/${sessionId}`);
}

export function getSessionTraces(sessionId: string) {
  return requestJson<{ traces: SessionHistoryResponse["traces"] }>(`/api/traces/${sessionId}`);
}

export function revertSession(sessionId: string, versionId: string) {
  return requestJson<{ sessionId: string; currentVersionId: string; revertedToVersionId: string }>(
    `/api/session/${sessionId}/revert`,
    {
      method: "POST",
      body: JSON.stringify({ versionId })
    }
  );
}

export function importDiagram(sessionId: string, xml: string, fileName: string, parentVersionId?: string | null) {
  return requestJson<DiagramImportResult>("/api/diagram/import", {
    method: "POST",
    body: JSON.stringify({ sessionId, xml, fileName, parentVersionId })
  });
}

export function generateDiagram(
  sessionId: string,
  prompt: string,
  parentVersionId?: string | null,
  imageProvider?: ImageGenerationProvider
) {
  return requestJson<DiagramGenerateResult>("/api/diagram/generate", {
    method: "POST",
    body: JSON.stringify({ sessionId, prompt, parentVersionId, imageProvider })
  });
}

export function editDiagram(
  sessionId: string,
  prompt: string,
  diagramModel: DiagramModel,
  existingXml: string,
  parentVersionId?: string | null
) {
  return requestJson<DiagramEditResult>("/api/diagram/edit", {
    method: "POST",
    body: JSON.stringify({ sessionId, prompt, diagramModel, existingXml, parentVersionId })
  });
}

export function directEditDiagram(
  sessionId: string,
  diagramModel: DiagramModel,
  operations: DirectDiagramEditOperation[],
  parentVersionId?: string | null
) {
  return requestJson<DiagramGenerateResult>("/api/diagram/direct-edit", {
    method: "POST",
    body: JSON.stringify({ sessionId, diagramModel, operations, parentVersionId })
  });
}

export function generateImage(
  sessionId: string,
  prompt: string,
  parentVersionId?: string | null,
  imageProvider?: ImageGenerationProvider
) {
  return requestJson<ImageWorkflowResult>("/api/image/generate", {
    method: "POST",
    body: JSON.stringify({ sessionId, prompt, parentVersionId, imageProvider })
  });
}

export function editImage(
  sessionId: string,
  prompt: string,
  imageBase64: string,
  maskBase64?: string,
  parentVersionId?: string | null,
  imageProvider?: ImageGenerationProvider
) {
  return requestJson<ImageWorkflowResult>("/api/image/edit", {
    method: "POST",
    body: JSON.stringify(buildImageEditPayload({ sessionId, prompt, imageBase64, maskBase64, parentVersionId, imageProvider }))
  });
}

export function artifactDownloadUrl(artifactId: string) {
  return `/api/download/${artifactId}`;
}

export function uploadArtifact(input: {
  sessionId: string;
  dataBase64: string;
  artifactType?: "image" | "diagram_xml" | "preview" | "mask" | "source";
  mode?: EditorMode;
  versionId?: string | null;
  fileName?: string;
  mimeType?: string;
}) {
  return requestJson<UploadArtifactResult>("/api/upload", {
    method: "POST",
    body: JSON.stringify({
      sessionId: input.sessionId,
      dataBase64: input.dataBase64,
      artifactType: input.artifactType ?? "source",
      mode: input.mode ?? "image",
      versionId: input.versionId,
      fileName: input.fileName,
      mimeType: input.mimeType
    })
  });
}
