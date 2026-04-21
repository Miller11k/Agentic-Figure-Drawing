import type {
  DiagramModel,
  DiagramSpec,
  DiagramTargetAnalysis,
  EditingAnalysis,
  ParsedEditIntent
} from "@/types";

export interface WorkflowContext {
  sessionId: string;
  parentVersionId?: string | null;
}

export interface DiagramGenerationWorkflowInput extends WorkflowContext {
  prompt: string;
}

export interface DiagramGenerationWorkflowResult {
  versionId: string;
  diagramSpec: DiagramSpec;
  diagramModel: DiagramModel;
  xml: string;
  repairApplied: boolean;
  artifactId: string;
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
  xml: string;
  repairApplied: boolean;
  artifactId: string;
}

export interface ImageGenerationWorkflowInput extends WorkflowContext {
  prompt: string;
}

export interface ImageWorkflowResult {
  versionId: string;
  parsedIntent: ParsedEditIntent;
  artifactId: string;
  mimeType: string;
  bytes: number | null;
  revisedPrompt?: string;
}

export interface ImageEditingWorkflowInput extends WorkflowContext {
  prompt: string;
  image: Buffer;
  mask?: Buffer;
}
