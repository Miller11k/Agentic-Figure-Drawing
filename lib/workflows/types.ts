import type {
  DiagramModel,
  DiagramSpec,
  DiagramTargetAnalysis,
  DirectDiagramEditOperation,
  EditingAnalysis,
  ParsedEditIntent
} from "@/types";
import type { ImageGenerationProvider } from "@/lib/google";

export interface WorkflowContext {
  sessionId: string;
  parentVersionId?: string | null;
}

export interface DiagramGenerationWorkflowInput extends WorkflowContext {
  prompt: string;
  diagramType?: string;
  imageProvider?: ImageGenerationProvider;
}

export interface DiagramGenerationWorkflowResult {
  versionId: string;
  inferredDiagramType?: string;
  expandedPrompt?: string;
  visualDraftArtifactId?: string;
  diagramSpec: DiagramSpec;
  diagramModel: DiagramModel;
  xml: string;
  repairApplied: boolean;
  artifactId: string;
}

export interface DiagramImportWorkflowInput extends WorkflowContext {
  xml: string;
  fileName?: string;
}

export interface DiagramImportWorkflowResult {
  versionId: string;
  diagramModel: DiagramModel;
  xml: string;
  artifactId: string;
  repairApplied: boolean;
  notes: string[];
}

export interface DiagramEditingWorkflowInput extends WorkflowContext {
  prompt: string;
  existingXml: string;
  diagramModel: DiagramModel;
}

export interface DiagramEditingWorkflowResult {
  versionId: string;
  parsedIntent: ParsedEditIntent;
  targetAnalysis: DiagramTargetAnalysis;
  editingAnalysis: EditingAnalysis;
  diagramModel: DiagramModel;
  xml: string;
  repairApplied: boolean;
  artifactId: string;
}

export interface DiagramDirectEditWorkflowInput extends WorkflowContext {
  diagramModel: DiagramModel;
  operations: DirectDiagramEditOperation[];
}

export interface DiagramDirectEditWorkflowResult {
  versionId: string;
  diagramModel: DiagramModel;
  xml: string;
  artifactId: string;
  operations: DirectDiagramEditOperation[];
}

export interface ImageGenerationWorkflowInput extends WorkflowContext {
  prompt: string;
  imageProvider?: ImageGenerationProvider;
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

export interface ImageEditingWorkflowInput extends WorkflowContext {
  prompt: string;
  image: Buffer;
  mask?: Buffer;
  imageProvider?: ImageGenerationProvider;
}
