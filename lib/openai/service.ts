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
import {
  fallbackDiagramTargetAnalysis,
  normalizeDiagramSpec,
  normalizeDiagramTargetAnalysis,
  normalizeEditingAnalysis,
  normalizeParsedEditIntent,
  normalizeXmlStringResponse,
  normalizeXmlValidationRepairResponse
} from "./normalizers";
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

function requireStructuredText(text: string, stageName: string): string {
  if (!text.trim()) {
    throw new Error(`OpenAI ${stageName} returned an empty response.`);
  }

  return text;
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

    return parseStructuredJson(
      requireStructuredText(result.text, "parseEditIntent"),
      parsedEditIntentSchema,
      (value) => normalizeParsedEditIntent(value, { prompt, mode })
    );
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

    try {
      return parseStructuredJson(
        requireStructuredText(result.text, "analyzeDiagramTargets"),
        diagramTargetAnalysisSchema,
        normalizeDiagramTargetAnalysis
      );
    } catch {
      return fallbackDiagramTargetAnalysis(parsedIntent, diagramModel);
    }
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

    return parseStructuredJson(
      requireStructuredText(result.text, "planDiagramEdits"),
      editingAnalysisSchema,
      (value) => normalizeEditingAnalysis(value, { parsedIntent, targetAnalysis })
    );
  }

  async generateDiagramSpec(prompt: string, context?: OpenAIStageContext): Promise<DiagramSpec> {
    const prompts = generateDiagramSpecPrompt(prompt);
    const result = await this.adapter.generateText({
      ...prompts,
      responseFormat: "json_object"
    });

    return parseStructuredJson(
      requireStructuredText(result.text, "generateDiagramSpec"),
      diagramSpecSchema,
      (value) => normalizeDiagramSpec(value, prompt)
    );
  }

  async generateDiagramXmlFromSpec(diagramSpec: DiagramSpec, context?: OpenAIStageContext): Promise<string> {
    const prompts = diagramXmlFromSpecPrompt(diagramSpec);
    const result = await this.adapter.generateText({
      ...prompts,
      responseFormat: "json_object"
    });

    return parseStructuredJson(
      requireStructuredText(result.text, "generateDiagramXmlFromSpec"),
      xmlStringResponseSchema,
      normalizeXmlStringResponse
    ).xml;
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

    return parseStructuredJson(
      requireStructuredText(result.text, "transformDiagramXml"),
      xmlStringResponseSchema,
      normalizeXmlStringResponse
    ).xml;
  }

  async validateAndRepairDiagramXml(xml: string, context?: OpenAIStageContext): Promise<ValidationRepairResult> {
    const prompts = validateAndRepairDiagramXmlPrompt(xml);
    const result = await this.adapter.generateText({
      ...prompts,
      responseFormat: "json_object"
    });

    return parseStructuredJson(
      requireStructuredText(result.text, "validateAndRepairDiagramXml"),
      xmlValidationRepairResponseSchema,
      (value) => normalizeXmlValidationRepairResponse(value, xml)
    );
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
