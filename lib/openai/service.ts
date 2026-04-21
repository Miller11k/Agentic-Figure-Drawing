import type { DiagramModel, DiagramSpec, EditingAnalysis, EditorMode, ParsedEditIntent } from "@/types";

function notImplemented(methodName: string): never {
  throw new Error(`${methodName} is a Phase 2 OpenAI workflow and is not implemented in Phase 1.`);
}

export interface OpenAIWorkflowService {
  parseEditIntent(prompt: string, mode: EditorMode): Promise<ParsedEditIntent>;
  analyzeDiagramTargets(diagramModel: DiagramModel, parsedIntent: ParsedEditIntent): Promise<unknown>;
  planDiagramEdits(
    diagramModel: DiagramModel,
    parsedIntent: ParsedEditIntent,
    targetAnalysis: unknown
  ): Promise<EditingAnalysis>;
  generateDiagramSpec(prompt: string): Promise<DiagramSpec>;
  generateDiagramXmlFromSpec(diagramSpec: DiagramSpec): Promise<string>;
  transformDiagramXml(existingXml: string, editPlan: EditingAnalysis): Promise<string>;
  validateAndRepairDiagramXml(xml: string): Promise<{ xml: string; repairApplied: boolean; notes: string[] }>;
  generateImageFromPrompt(prompt: string): Promise<Buffer>;
  editImageWithPrompt(image: Buffer, prompt: string, mask?: Buffer): Promise<Buffer>;
  summarizeArtifactChanges(before: unknown, after: unknown, context: unknown): Promise<string>;
}

export class PhaseOneOpenAIWorkflowService implements OpenAIWorkflowService {
  async parseEditIntent(): Promise<ParsedEditIntent> {
    return notImplemented("parseEditIntent");
  }

  async analyzeDiagramTargets(): Promise<unknown> {
    return notImplemented("analyzeDiagramTargets");
  }

  async planDiagramEdits(): Promise<EditingAnalysis> {
    return notImplemented("planDiagramEdits");
  }

  async generateDiagramSpec(): Promise<DiagramSpec> {
    return notImplemented("generateDiagramSpec");
  }

  async generateDiagramXmlFromSpec(): Promise<string> {
    return notImplemented("generateDiagramXmlFromSpec");
  }

  async transformDiagramXml(): Promise<string> {
    return notImplemented("transformDiagramXml");
  }

  async validateAndRepairDiagramXml(): Promise<{ xml: string; repairApplied: boolean; notes: string[] }> {
    return notImplemented("validateAndRepairDiagramXml");
  }

  async generateImageFromPrompt(): Promise<Buffer> {
    return notImplemented("generateImageFromPrompt");
  }

  async editImageWithPrompt(): Promise<Buffer> {
    return notImplemented("editImageWithPrompt");
  }

  async summarizeArtifactChanges(): Promise<string> {
    return notImplemented("summarizeArtifactChanges");
  }
}

export const openAIWorkflowService = new PhaseOneOpenAIWorkflowService();
