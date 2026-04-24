import type {
  DiagramModel,
  DiagramSpec,
  DiagramTargetAnalysis,
  EditingAnalysis,
  EditorMode,
  ParsedEditIntent
} from "@/types";

export interface OpenAIStageContext {
  sessionId?: string;
  versionId?: string | null;
  pipelineName?: string;
  stageName?: string;
}

export interface OpenAIModelConfig {
  textModel: string;
  imageModel: string;
}

export interface OpenAITextResult {
  text: string;
  modelUsed: string;
  tokenUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface OpenAIImageResult {
  image: Buffer;
  mimeType: string;
  modelUsed: string;
  revisedPrompt?: string;
  tokenUsage?: unknown;
}

export interface OpenAIClientAdapter {
  generateText(input: {
    systemPrompt: string;
    userPrompt: string;
    model?: string;
    responseFormat?: "json_object" | "text";
  }): Promise<OpenAITextResult>;
  generateTextFromImage(input: {
    systemPrompt: string;
    userPrompt: string;
    image: Buffer;
    mimeType: string;
    model?: string;
    responseFormat?: "json_object" | "text";
  }): Promise<OpenAITextResult>;
  generateImage(input: {
    prompt: string;
    model?: string;
    size?: "1024x1024" | "1536x1024" | "1024x1536" | "auto";
  }): Promise<OpenAIImageResult>;
  editImage(input: {
    image: Buffer;
    prompt: string;
    mask?: Buffer;
    model?: string;
    imageFileName?: string;
    maskFileName?: string;
  }): Promise<OpenAIImageResult>;
}

export interface ValidationRepairResult {
  xml: string;
  repairApplied: boolean;
  notes: string[];
}

export interface DiagramTypeInference {
  diagramType: string;
  confidence: number;
  reasoningSummary: string;
  expertFraming: string;
}

export interface ExpandedDiagramPrompt extends DiagramTypeInference {
  expandedPrompt: string;
}

export interface DiagramVerificationResult {
  matchesIntent: boolean;
  confidence: number;
  issues: string[];
  correctionSummary: string;
  safeCorrections: {
    nodeLabels: Record<string, string>;
    edgeLabels: Record<string, string>;
    groupLabels: Record<string, string>;
    nodeTypes: Record<string, string>;
    nodeIcons: Record<string, string>;
    notes: string[];
  };
}

export interface OpenAIWorkflowService {
  parseEditIntent(prompt: string, mode: EditorMode, context?: OpenAIStageContext): Promise<ParsedEditIntent>;
  analyzeDiagramTargets(
    diagramModel: DiagramModel,
    parsedIntent: ParsedEditIntent,
    context?: OpenAIStageContext
  ): Promise<DiagramTargetAnalysis>;
  planDiagramEdits(
    diagramModel: DiagramModel,
    parsedIntent: ParsedEditIntent,
    targetAnalysis: DiagramTargetAnalysis,
    context?: OpenAIStageContext
  ): Promise<EditingAnalysis>;
  inferAndExpandDiagramPrompt(prompt: string, context?: OpenAIStageContext): Promise<ExpandedDiagramPrompt>;
  inferDiagramType(prompt: string, context?: OpenAIStageContext): Promise<DiagramTypeInference>;
  expandDiagramPrompt(prompt: string, diagramType: string, context?: OpenAIStageContext): Promise<string>;
  generateDiagramSpec(prompt: string, context?: OpenAIStageContext): Promise<DiagramSpec>;
  generateDiagramSpecFromImage(
    image: Buffer,
    prompt: string,
    diagramType?: string,
    mimeType?: string,
    context?: OpenAIStageContext
  ): Promise<DiagramSpec>;
  verifyDiagramAgainstPrompt(
    image: Buffer,
    prompt: string,
    diagramSpec: DiagramSpec,
    diagramType?: string,
    mimeType?: string,
    context?: OpenAIStageContext
  ): Promise<DiagramVerificationResult>;
  generateDiagramXmlFromSpec(diagramSpec: DiagramSpec, context?: OpenAIStageContext): Promise<string>;
  transformDiagramXml(
    existingXml: string,
    editPlan: EditingAnalysis,
    context?: OpenAIStageContext
  ): Promise<string>;
  validateAndRepairDiagramXml(xml: string, context?: OpenAIStageContext): Promise<ValidationRepairResult>;
  generateImageFromPrompt(prompt: string, context?: OpenAIStageContext): Promise<OpenAIImageResult>;
  editImageWithPrompt(
    image: Buffer,
    prompt: string,
    mask?: Buffer,
    context?: OpenAIStageContext
  ): Promise<OpenAIImageResult>;
  summarizeArtifactChanges(
    before: unknown,
    after: unknown,
    context: unknown,
    stageContext?: OpenAIStageContext
  ): Promise<string>;
}
