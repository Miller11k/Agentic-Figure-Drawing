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
  diagramTypeInferenceSchema,
  diagramVerificationResponseSchema,
  editingAnalysisSchema,
  expandedDiagramPromptSchema,
  parsedEditIntentSchema,
  xmlStringResponseSchema,
  xmlValidationRepairResponseSchema
} from "@/lib/validation/schemas";
import {
  analyzeDiagramTargetsPrompt,
  diagramXmlFromSpecPrompt,
  inferAndExpandDiagramPrompt as inferAndExpandDiagramPromptTemplate,
  expandDiagramTypePrompt,
  generateDiagramSpecFromImagePrompt,
  generateDiagramSpecPrompt,
  inferDiagramTypePrompt,
  parseEditIntentPrompt,
  planDiagramEditsPrompt,
  summarizeArtifactChangesPrompt,
  transformDiagramXmlPrompt,
  validateAndRepairDiagramXmlPrompt,
  verifyDiagramAgainstPromptPrompt
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
  DiagramTypeInference,
  DiagramVerificationResult,
  ExpandedDiagramPrompt,
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

  async generateDiagramSpecFromImage(
    image: Buffer,
    prompt: string,
    diagramType?: string,
    mimeType = "image/png",
    context?: OpenAIStageContext
  ): Promise<DiagramSpec> {
    const prompts = generateDiagramSpecFromImagePrompt(prompt, diagramType);
    const result = await this.adapter.generateTextFromImage({
      ...prompts,
      image,
      mimeType,
      responseFormat: "json_object"
    });

    return parseStructuredJson(
      requireStructuredText(result.text, "generateDiagramSpecFromImage"),
      diagramSpecSchema,
      (value) => normalizeDiagramSpec(value, prompt)
    );
  }

  async verifyDiagramAgainstPrompt(
    image: Buffer,
    prompt: string,
    diagramSpec: DiagramSpec,
    diagramType?: string,
    mimeType = "image/svg+xml",
    context?: OpenAIStageContext
  ): Promise<DiagramVerificationResult> {
    const prompts = verifyDiagramAgainstPromptPrompt(prompt, diagramSpec, diagramType);
    const result =
      image.byteLength > 0
        ? await this.adapter.generateTextFromImage({
            ...prompts,
            image,
            mimeType,
            responseFormat: "json_object"
          })
        : await this.adapter.generateText({
            ...prompts,
            responseFormat: "json_object"
          });

    const verification = parseStructuredJson(
      requireStructuredText(result.text, "verifyDiagramAgainstPrompt"),
      diagramVerificationResponseSchema,
      (value) => value
    );

    return {
      matchesIntent: verification.matchesIntent,
      confidence: verification.confidence,
      issues: verification.issues ?? [],
      correctionSummary: verification.correctionSummary ?? "",
      safeCorrections: {
        nodeLabels: verification.safeCorrections?.nodeLabels ?? {},
        edgeLabels: verification.safeCorrections?.edgeLabels ?? {},
        groupLabels: verification.safeCorrections?.groupLabels ?? {},
        nodeTypes: verification.safeCorrections?.nodeTypes ?? {},
        nodeIcons: verification.safeCorrections?.nodeIcons ?? {},
        notes: verification.safeCorrections?.notes ?? []
      }
    };
  }

  async inferDiagramType(prompt: string, context?: OpenAIStageContext): Promise<DiagramTypeInference> {
    const prompts = inferDiagramTypePrompt(prompt);
    const result = await this.adapter.generateText({
      ...prompts,
      responseFormat: "json_object"
    });

    const inference = parseStructuredJson(
      requireStructuredText(result.text, "inferDiagramType"),
      diagramTypeInferenceSchema,
      (value) => {
        const record = value as Record<string, unknown>;
        return {
          diagramType: typeof record.diagramType === "string" && record.diagramType.trim()
            ? record.diagramType.trim()
            : "general editable diagram",
          confidence: typeof record.confidence === "number" ? Math.min(1, Math.max(0, record.confidence)) : 0.5,
          reasoningSummary: typeof record.reasoningSummary === "string" ? record.reasoningSummary : "",
          expertFraming: typeof record.expertFraming === "string" ? record.expertFraming : ""
        };
      }
    );

    return {
      diagramType: inference.diagramType,
      confidence: inference.confidence,
      reasoningSummary: inference.reasoningSummary ?? "",
      expertFraming: inference.expertFraming ?? ""
    };
  }

  async inferAndExpandDiagramPrompt(prompt: string, context?: OpenAIStageContext): Promise<ExpandedDiagramPrompt> {
    const prompts = inferAndExpandDiagramPromptTemplate(prompt);
    const result = await this.adapter.generateText({
      ...prompts,
      responseFormat: "json_object"
    });

    const expanded = parseStructuredJson(
      requireStructuredText(result.text, "inferAndExpandDiagramPrompt"),
      expandedDiagramPromptSchema,
      (value) => {
        const record = value as Record<string, unknown>;
        return {
          diagramType: typeof record.diagramType === "string" && record.diagramType.trim()
            ? record.diagramType.trim()
            : "general editable diagram",
          confidence: typeof record.confidence === "number" ? Math.min(1, Math.max(0, record.confidence)) : 0.5,
          reasoningSummary: typeof record.reasoningSummary === "string" ? record.reasoningSummary : "",
          expertFraming: typeof record.expertFraming === "string" ? record.expertFraming : "",
          expandedPrompt: typeof record.expandedPrompt === "string" && record.expandedPrompt.trim()
            ? record.expandedPrompt.trim()
            : prompt
        };
      }
    );

    return {
      diagramType: expanded.diagramType,
      confidence: expanded.confidence,
      reasoningSummary: expanded.reasoningSummary ?? "",
      expertFraming: expanded.expertFraming ?? "",
      expandedPrompt: expanded.expandedPrompt
    };
  }

  async expandDiagramPrompt(prompt: string, diagramType: string, context?: OpenAIStageContext): Promise<string> {
    const prompts = expandDiagramTypePrompt(prompt, diagramType);
    const result = await this.adapter.generateText({
      ...prompts,
      responseFormat: "text"
    });

    return requireStructuredText(result.text, "expandDiagramPrompt").trim();
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
