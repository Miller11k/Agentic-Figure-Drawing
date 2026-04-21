import type { DiagramModel, EditingAnalysis, EditorMode, ParsedEditIntent } from "./core";

export type SessionStepType =
  | "create"
  | "upload"
  | "prompt"
  | "direct-edit"
  | "revert"
  | "system";

export type ArtifactType = "image" | "diagram_xml" | "preview" | "mask" | "source";

export type TraceStatus = "pending" | "success" | "error" | "skipped";

export interface ArtifactPointer {
  artifactId: string;
  artifactType: ArtifactType;
  storagePath: string;
}

export interface SessionStep {
  sessionId: string;
  versionId: string;
  parentVersionId?: string | null;
  stepType: SessionStepType;
  prompt?: string | null;
  parsedIntent?: ParsedEditIntent | null;
  editingAnalysis?: EditingAnalysis | null;
  mode: EditorMode;
  artifactPointers: ArtifactPointer[];
  previewReference?: string | null;
  diagramModel?: DiagramModel | null;
  timestamp: string;
}

export interface ArtifactRecord {
  artifactId: string;
  artifactType: ArtifactType;
  storagePath: string;
  mimeType: string;
  versionId: string;
  metadata: Record<string, unknown>;
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface OpenAITraceRecord {
  traceId: string;
  sessionId: string;
  versionId?: string | null;
  pipelineName: string;
  stageName: string;
  inputSummary: string;
  outputSummary?: string | null;
  startedAt: string;
  endedAt?: string | null;
  latencyMs?: number | null;
  status: TraceStatus;
  repairApplied: boolean;
  modelUsed?: string | null;
  tokenUsage?: TokenUsage | null;
}
