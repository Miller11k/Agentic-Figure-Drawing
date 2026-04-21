import type {
  DiagramModel,
  DiagramSpec,
  DiagramTargetAnalysis,
  EditingAnalysis,
  EditorMode,
  ParsedEditIntent
} from "@/types";
import {
  diagramSpecSchema,
  diagramTargetAnalysisSchema,
  editingAnalysisSchema,
  parsedEditIntentSchema,
  xmlStringResponseSchema,
  xmlValidationRepairResponseSchema
} from "@/lib/validation/schemas";
import {
  analyzeDiagramTargetsPrompt,
  diagramXmlFromSpecPrompt,
  generateDiagramSpecPrompt,
  parseEditIntentPrompt,
  planDiagramEditsPrompt,
  summarizeArtifactChangesPrompt,
  transformDiagramXmlPrompt,
  validateAndRepairDiagramXmlPrompt
} from "./prompts";
import { defaultOpenAIClientAdapter } from "./client";
import { parseStructuredJson } from "./json";
import type {
  OpenAIClientAdapter,
  OpenAIImageResult,
  OpenAIStageContext,
  OpenAIWorkflowService,
  ValidationRepairResult
} from "./types";

function stageName(context: OpenAIStageContext | undefined, fallback: string): string {
  return context?.stageName ?? fallback;
}

function pipelineName(context: OpenAIStageContext | undefined, fallback: string): string {
  return context?.pipelineName ?? fallback;
}

export class OpenAIWorkflowServiceImpl implements OpenAIWorkflowService {
  constructor(private readonly adapter: OpenAIClientAdapter = defaultOpenAIClientAdapter) {}

  async parseEditIntent(
    prompt: string,
    mode: EditorMode,
    context?: OpenAIStageContext
  ): Promise<ParsedEditIntent> {
    const prompts = parseEditIntentPrompt(prompt, mode);
    const result = await this.adapter.generateText({
      ...prompts,
      responseFormat: "json_object"
    });

    return parsedEditIntentSchema.parse(parseStructuredJson(result.text, parsedEditIntentSchema));
  }

  async analyzeDiagramTargets(
    diagramModel: DiagramModel,
    parsedIntent: ParsedEditIntent,
    context?: OpenAIStageContext
  ): Promise<DiagramTargetAnalysis> {
    const prompts = analyzeDiagramTargetsPrompt(diagramModel, parsedIntent);
    const result = await this.adapter.generateText({
      ...prompts,
      responseFormat: "json_object"
    });

    return diagramTargetAnalysisSchema.parse(parseStructuredJson(result.text, diagramTargetAnalysisSchema));
  }

  async planDiagramEdits(
    diagramModel: DiagramModel,
    parsedIntent: ParsedEditIntent,
    targetAnalysis: DiagramTargetAnalysis,
    context?: OpenAIStageContext
  ): Promise<EditingAnalysis> {
    const prompts = planDiagramEditsPrompt(diagramModel, parsedIntent, targetAnalysis);
    const result = await this.adapter.generateText({
      ...prompts,
      responseFormat: "json_object"
    });

    return editingAnalysisSchema.parse(parseStructuredJson(result.text, editingAnalysisSchema));
  }

  async generateDiagramSpec(prompt: string, context?: OpenAIStageContext): Promise<DiagramSpec> {
    const prompts = generateDiagramSpecPrompt(prompt);
    const result = await this.adapter.generateText({
      ...prompts,
      responseFormat: "json_object"
    });

    return diagramSpecSchema.parse(parseStructuredJson(result.text, diagramSpecSchema));
  }

  async generateDiagramXmlFromSpec(diagramSpec: DiagramSpec, context?: OpenAIStageContext): Promise<string> {
    const prompts = diagramXmlFromSpecPrompt(diagramSpec);
    const result = await this.adapter.generateText({
      ...prompts,
      responseFormat: "json_object"
    });

    return parseStructuredJson(result.text, xmlStringResponseSchema).xml;
  }

  async transformDiagramXml(
    existingXml: string,
    editPlan: EditingAnalysis,
    context?: OpenAIStageContext
  ): Promise<string> {
    const prompts = transformDiagramXmlPrompt(existingXml, editPlan);
    const result = await this.adapter.generateText({
      ...prompts,
      responseFormat: "json_object"
    });

    return parseStructuredJson(result.text, xmlStringResponseSchema).xml;
  }

  async validateAndRepairDiagramXml(xml: string, context?: OpenAIStageContext): Promise<ValidationRepairResult> {
    const prompts = validateAndRepairDiagramXmlPrompt(xml);
    const result = await this.adapter.generateText({
      ...prompts,
      responseFormat: "json_object"
    });

    return parseStructuredJson(result.text, xmlValidationRepairResponseSchema);
  }

  async generateImageFromPrompt(prompt: string, context?: OpenAIStageContext): Promise<OpenAIImageResult> {
    return this.adapter.generateImage({ prompt });
  }

  async editImageWithPrompt(
    image: Buffer,
    prompt: string,
    mask?: Buffer,
    context?: OpenAIStageContext
  ): Promise<OpenAIImageResult> {
    return this.adapter.editImage({ image, prompt, mask });
  }

  async summarizeArtifactChanges(
    before: unknown,
    after: unknown,
    context: unknown,
    stageContext?: OpenAIStageContext
  ): Promise<string> {
    const prompts = summarizeArtifactChangesPrompt(before, after, context);
    const result = await this.adapter.generateText({
      ...prompts,
      responseFormat: "text"
    });

    return result.text.trim();
  }

  describeStage(context: OpenAIStageContext | undefined, fallbackStage: string, fallbackPipeline: string) {
    return {
      stageName: stageName(context, fallbackStage),
      pipelineName: pipelineName(context, fallbackPipeline)
    };
  }
}

export const openAIWorkflowService = new OpenAIWorkflowServiceImpl();
