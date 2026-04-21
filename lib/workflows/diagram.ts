import { createDiagramModelFromSpec } from "@/lib/diagram";
import { getOpenAIModelConfig, openAIWorkflowService } from "@/lib/openai";
import { createVersionStep, updateVersionStructuredState } from "@/lib/session";
import { persistArtifactForVersion } from "@/lib/storage";
import { runTracedStage, summarizeForTrace } from "@/lib/trace";
import { createDrawioXmlFromModel, validateAndRepairDrawioXml } from "@/lib/xml";
import type {
  DiagramEditingWorkflowInput,
  DiagramEditingWorkflowResult,
  DiagramGenerationWorkflowInput,
  DiagramGenerationWorkflowResult
} from "./types";

export async function runDiagramGenerationPipeline(
  input: DiagramGenerationWorkflowInput
): Promise<DiagramGenerationWorkflowResult> {
  const models = getOpenAIModelConfig();
  const version = await createVersionStep({
    sessionId: input.sessionId,
    parentVersionId: input.parentVersionId,
    stepType: "prompt",
    mode: "diagram",
    prompt: input.prompt,
    metadata: { pipelineName: "diagram-generation", status: "started" }
  });

  const traceBase = {
    sessionId: input.sessionId,
    versionId: version.id,
    pipelineName: "diagram-generation"
  };

  const { result: diagramSpec } = await runTracedStage(
    {
      ...traceBase,
      stageName: "generate-diagram-spec",
      inputSummary: summarizeForTrace({ prompt: input.prompt }),
      modelUsed: models.textModel
    },
    () => openAIWorkflowService.generateDiagramSpec(input.prompt)
  );

  const { result: diagramModel } = await runTracedStage(
    {
      ...traceBase,
      stageName: "spec-to-diagram-model",
      inputSummary: summarizeForTrace(diagramSpec)
    },
    async () => createDiagramModelFromSpec(diagramSpec)
  );

  const { result: generatedXml } = await runTracedStage(
    {
      ...traceBase,
      stageName: "diagram-model-to-xml",
      inputSummary: summarizeForTrace(diagramModel)
    },
    async () => createDrawioXmlFromModel(diagramModel),
    (xml) => summarizeForTrace({ xmlLength: xml.length })
  );

  const { result: validation } = await runTracedStage(
    {
      ...traceBase,
      stageName: "validate-and-repair-xml",
      inputSummary: summarizeForTrace({ xmlLength: generatedXml.length })
    },
    async () => validateAndRepairDrawioXml(generatedXml)
  );

  const artifact = await persistArtifactForVersion({
    sessionId: input.sessionId,
    versionId: version.id,
    artifactType: "diagram_xml",
    fileName: "diagram.drawio",
    mimeType: "application/xml",
    data: Buffer.from(validation.xml, "utf8"),
    metadata: {
      pipelineName: "diagram-generation",
      repairApplied: validation.repairApplied,
      notes: validation.notes
    }
  });

  await updateVersionStructuredState({
    versionId: version.id,
    diagramModel,
    metadata: {
      pipelineName: "diagram-generation",
      status: "completed",
      artifactId: artifact.id,
      repairApplied: validation.repairApplied
    }
  });

  return {
    versionId: version.id,
    diagramSpec,
    diagramModel,
    xml: validation.xml,
    repairApplied: validation.repairApplied,
    artifactId: artifact.id
  };
}

export async function runDiagramEditingPipeline(
  input: DiagramEditingWorkflowInput
): Promise<DiagramEditingWorkflowResult> {
  const models = getOpenAIModelConfig();
  const version = await createVersionStep({
    sessionId: input.sessionId,
    parentVersionId: input.parentVersionId,
    stepType: "prompt",
    mode: "diagram",
    prompt: input.prompt,
    diagramModel: input.diagramModel,
    metadata: { pipelineName: "diagram-editing", status: "started" }
  });

  const traceBase = {
    sessionId: input.sessionId,
    versionId: version.id,
    pipelineName: "diagram-editing"
  };

  const { result: parsedIntent } = await runTracedStage(
    {
      ...traceBase,
      stageName: "parse-edit-intent",
      inputSummary: summarizeForTrace({ prompt: input.prompt, mode: "diagram" }),
      modelUsed: models.textModel
    },
    () => openAIWorkflowService.parseEditIntent(input.prompt, "diagram")
  );

  const { result: targetAnalysis } = await runTracedStage(
    {
      ...traceBase,
      stageName: "analyze-diagram-targets",
      inputSummary: summarizeForTrace({ parsedIntent, nodeCount: input.diagramModel.nodes.length }),
      modelUsed: models.textModel
    },
    () => openAIWorkflowService.analyzeDiagramTargets(input.diagramModel, parsedIntent)
  );

  const { result: editingAnalysis } = await runTracedStage(
    {
      ...traceBase,
      stageName: "plan-diagram-edits",
      inputSummary: summarizeForTrace({ parsedIntent, targetAnalysis }),
      modelUsed: models.textModel
    },
    () => openAIWorkflowService.planDiagramEdits(input.diagramModel, parsedIntent, targetAnalysis)
  );

  const { result: transformedXml } = await runTracedStage(
    {
      ...traceBase,
      stageName: "transform-diagram-xml",
      inputSummary: summarizeForTrace({ xmlLength: input.existingXml.length, editingAnalysis }),
      modelUsed: models.textModel
    },
    () => openAIWorkflowService.transformDiagramXml(input.existingXml, editingAnalysis),
    (xml) => summarizeForTrace({ xmlLength: xml.length })
  );

  const { result: validation } = await runTracedStage(
    {
      ...traceBase,
      stageName: "validate-and-repair-xml",
      inputSummary: summarizeForTrace({ xmlLength: transformedXml.length })
    },
    async () => {
      const deterministic = validateAndRepairDrawioXml(transformedXml);

      if (deterministic.valid) {
        return deterministic;
      }

      return openAIWorkflowService.validateAndRepairDiagramXml(transformedXml);
    }
  );

  const artifact = await persistArtifactForVersion({
    sessionId: input.sessionId,
    versionId: version.id,
    artifactType: "diagram_xml",
    fileName: "diagram-edited.drawio",
    mimeType: "application/xml",
    data: Buffer.from(validation.xml, "utf8"),
    metadata: {
      pipelineName: "diagram-editing",
      repairApplied: validation.repairApplied,
      notes: validation.notes
    }
  });

  await updateVersionStructuredState({
    versionId: version.id,
    parsedIntent,
    editingAnalysis,
    diagramModel: input.diagramModel,
    metadata: {
      pipelineName: "diagram-editing",
      status: "completed",
      artifactId: artifact.id,
      repairApplied: validation.repairApplied
    }
  });

  return {
    versionId: version.id,
    parsedIntent,
    targetAnalysis,
    editingAnalysis,
    xml: validation.xml,
    repairApplied: validation.repairApplied,
    artifactId: artifact.id
  };
}
