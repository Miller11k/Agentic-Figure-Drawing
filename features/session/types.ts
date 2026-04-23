import type { ArtifactType, DiagramModel, EditingAnalysis, EditorMode, ParsedEditIntent, SessionStep } from "@/types";
import type { ImageGenerationProvider } from "@/lib/google";

export interface ApiArtifact {
  id: string;
  sessionId: string;
  versionId: string;
  type: ArtifactType;
  storagePath: string;
  mimeType: string;
  bytes?: number | null;
  checksum?: string | null;
  metadata?: string | null;
  createdAt: string;
}

export interface ApiTrace {
  id: string;
  sessionId: string;
  versionId?: string | null;
  pipelineName: string;
  stageName: string;
  inputSummary: string;
  outputSummary?: string | null;
  startedAt: string;
  endedAt?: string | null;
  latencyMs?: number | null;
  status: string;
  repairApplied: boolean;
  modelUsed?: string | null;
  errorMessage?: string | null;
}

export interface SessionHistoryResponse {
  id: string;
  title?: string | null;
  currentVersionId?: string | null;
  createdAt: string;
  updatedAt: string;
  steps: SessionStep[];
  artifacts: ApiArtifact[];
  traces: ApiTrace[];
}

export interface CreateSessionResponse {
  session: {
    id: string;
    title?: string | null;
    currentVersionId?: string | null;
  };
  initialVersion: {
    id: string;
  };
}

export interface DiagramImportResult {
  versionId: string;
  diagramModel: DiagramModel;
  xml: string;
  artifactId: string;
  repairApplied: boolean;
  notes: string[];
}

export interface DiagramGenerateResult {
  versionId: string;
  inferredDiagramType?: string;
  expandedPrompt?: string;
  visualDraftArtifactId?: string;
  diagramModel: DiagramModel;
  xml: string;
  artifactId: string;
  repairApplied: boolean;
}

export interface ImageWorkflowResult {
  versionId: string;
  parsedIntent: ParsedEditIntent;
  artifactId: string;
  sourceArtifactId?: string;
  maskArtifactId?: string;
  mimeType: string;
  bytes: number | null;
  revisedPrompt?: string;
  provider?: ImageGenerationProvider;
}

export interface UploadArtifactResult {
  versionId: string;
  artifact: ApiArtifact;
}

export interface DiagramEditResult {
  versionId: string;
  parsedIntent: ParsedEditIntent;
  editingAnalysis: EditingAnalysis;
  diagramModel: DiagramModel;
  xml: string;
  artifactId: string;
}

export interface WorkflowError {
  message: string;
  details?: unknown;
}

export interface PromptActionInput {
  sessionId: string;
  mode: EditorMode;
  prompt: string;
  diagramModel?: DiagramModel;
  existingXml?: string;
}
