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
  generateDiagramSpec(prompt: string, context?: OpenAIStageContext): Promise<DiagramSpec>;
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
