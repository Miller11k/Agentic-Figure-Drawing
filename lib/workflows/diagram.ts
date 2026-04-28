import { applyDirectDiagramEdits, createDiagramModelFromSpec, isMermaidDiagram, parseMermaidToDiagramSpec } from "@/lib/diagram";
import { getGoogleImageModelConfig, googleImageClient, type ImageGenerationProvider } from "@/lib/google";
import { getOpenAIModelConfig, openAIWorkflowService } from "@/lib/openai";
import { createVersionStep, updateVersionStructuredState } from "@/lib/session";
import { persistArtifactForVersion } from "@/lib/storage";
import { runTracedStage, summarizeForTrace } from "@/lib/trace";
import { rasterizeSvgToPng } from "@/lib/diagram/rasterize";
import { createDiagramSvgFromModel } from "@/lib/diagram/svg";
import { supportedDiagramIconPromptCatalog } from "@/lib/diagram/icon-catalog";
import {
  createDrawioXmlFromModel,
  parseDrawioXmlToDiagramModel,
  validateAndRepairDrawioXml
} from "@/lib/xml";
import type { DiagramModel, DiagramSpec } from "@/types";
import type {
  DiagramDirectEditWorkflowInput,
  DiagramDirectEditWorkflowResult,
  DiagramEditingWorkflowInput,
  DiagramEditingWorkflowResult,
  DiagramImageReconstructionWorkflowInput,
  DiagramGenerationWorkflowInput,
  DiagramGenerationWorkflowResult,
  DiagramImportWorkflowInput,
  DiagramImportWorkflowResult
} from "./types";

type SafeDiagramCorrections = {
  nodeLabels: Record<string, string>;
  edgeLabels: Record<string, string>;
  groupLabels: Record<string, string>;
  nodeTypes: Record<string, string>;
  nodeIcons: Record<string, string>;
  notes: string[];
};

function defaultDiagramImageProvider(): ImageGenerationProvider {
  const configured = process.env.DIAGRAM_IMAGE_PROVIDER ?? process.env.IMAGE_GENERATION_PROVIDER;
  return configured === "gemini" ? "gemini" : "openai";
}

function diagramVisualDraftPrompt(generationPrompt: string, diagramType?: string) {
  return [
    "Create a high-resolution reference image for an editable Draw.io/diagrams.net diagram.",
    "This image will be passed to OpenAI vision for structured XML extraction, so every element must be explicit and legible.",
    "Use an optimized layout with no overlapping labels, regions, lanes, icons, node text, or edge labels.",
    "Include concrete diagram primitives whenever relevant: start/end terminators, conditional decision diamonds, input/output parallelograms, process blocks, service/API blocks, data stores/cylinders, queues, documents, cloud/user/icons, image/icon nodes, swimlanes/regions, and directional connectors.",
    "Use varied block types, arrow styles, edge labels, region boundaries, and iconography that match the requested diagram type.",
    "Use semantically correct icons from common diagramming conventions: users/actors, servers, APIs/services, databases, object storage, queues/topics, caches, routers, switches, firewalls, load balancers, gateways, cloud/VPC/subnet/region containers, documents, tables/classes, lifelines, UI screens, and external systems.",
    "Do not use generic boxes when a standard icon or diagram-family shape better communicates the element.",
    "Supported editable icon/type catalog:",
    supportedDiagramIconPromptCatalog(),
    "If the catalog does not fit a domain-specific element, draw a clean custom icon/graphic and make it visually distinct, simple, and suitable for later extraction as a custom-icon image node.",
    diagramType ? `Diagram type: ${diagramType}.` : "Diagram type: infer the best editable diagram type from the prompt.",
    generationPrompt
  ].join("\n");
}

function applySafeDiagramCorrections(spec: DiagramSpec, corrections: SafeDiagramCorrections): {
  spec: DiagramSpec;
  applied: string[];
} {
  const applied: string[] = [];
  const nodeIds = new Set(spec.nodes.map((node) => node.id).filter((id): id is string => Boolean(id)));
  const edgeIds = new Set(spec.edges.map((edge) => edge.id).filter((id): id is string => Boolean(id)));
  const groupIds = new Set(spec.groups.map((group) => group.id).filter((id): id is string => Boolean(id)));

  const next: DiagramSpec = {
    ...spec,
    nodes: spec.nodes.map((node) => {
      if (!node.id || !nodeIds.has(node.id)) return node;
      const label = corrections.nodeLabels[node.id]?.trim();
      const type = corrections.nodeTypes[node.id]?.trim();
      const icon = corrections.nodeIcons[node.id]?.trim();
      const nextNode = { ...node };

      if (label && label !== node.label) {
        nextNode.label = label;
        applied.push(`node label:${node.id}`);
      }

      if (type && type !== node.type) {
        nextNode.type = type;
        applied.push(`node type:${node.id}`);
      }

      if (icon && icon !== node.attributes?.icon) {
        nextNode.attributes = { ...(node.attributes ?? {}), icon };
        applied.push(`node icon:${node.id}`);
      }

      return nextNode;
    }),
    edges: spec.edges.map((edge) => {
      if (!edge.id || !edgeIds.has(edge.id)) return edge;
      const label = corrections.edgeLabels[edge.id]?.trim();

      if (!label || label === edge.label) return edge;
      applied.push(`edge label:${edge.id}`);
      return { ...edge, label };
    }),
    groups: spec.groups.map((group) => {
      if (!group.id || !groupIds.has(group.id)) return group;
      const label = corrections.groupLabels[group.id]?.trim();

      if (!label || label === group.label) return group;
      applied.push(`group label:${group.id}`);
      return { ...group, label };
    })
  };

  return { spec: next, applied };
}

function applySafeCorrectionsToModel(model: DiagramModel, corrections: SafeDiagramCorrections): DiagramModel {
  return {
    ...model,
    nodes: model.nodes.map((node) => ({
      ...node,
      label: corrections.nodeLabels[node.id]?.trim() || node.label,
      type: corrections.nodeTypes[node.id]?.trim() || node.type,
      style: {
        ...node.style,
        ...(corrections.nodeIcons[node.id]?.trim() ? { icon: corrections.nodeIcons[node.id].trim() } : {})
      }
    })),
    edges: model.edges.map((edge) => ({
      ...edge,
      label: corrections.edgeLabels[edge.id]?.trim() || edge.label
    })),
    groups: model.groups.map((group) => ({
      ...group,
      label: corrections.groupLabels[group.id]?.trim() || group.label
    }))
  };
}

export async function runDiagramImportPipeline(
  input: DiagramImportWorkflowInput
): Promise<DiagramImportWorkflowResult> {
  const version = await createVersionStep({
    sessionId: input.sessionId,
    parentVersionId: input.parentVersionId,
    stepType: "upload",
    mode: "diagram",
    metadata: { pipelineName: "diagram-import", status: "started", fileName: input.fileName }
  });

  const sourceIsMermaid = isMermaidDiagram(input.xml) || /\.(mmd|mermaid|md)$/i.test(input.fileName ?? "");
  const diagramSpec = sourceIsMermaid ? parseMermaidToDiagramSpec(input.xml, input.fileName ?? "Mermaid diagram") : undefined;
  const importedXml = diagramSpec ? createDrawioXmlFromModel(createDiagramModelFromSpec(diagramSpec)) : input.xml;
  const validation = validateAndRepairDrawioXml(importedXml);

  if (!validation.valid) {
    throw new Error(`Imported XML is invalid: ${validation.errors.join(" ")}`);
  }

  const diagramModel = diagramSpec
    ? (() => {
        const model = createDiagramModelFromSpec(diagramSpec);
        return {
          ...model,
          sourceXml: input.xml,
          normalized: {
            ...model.normalized,
            format: "mermaid",
            sourceFileName: input.fileName
          }
        };
      })()
    : parseDrawioXmlToDiagramModel(validation.xml);
  const artifact = await persistArtifactForVersion({
    sessionId: input.sessionId,
    versionId: version.id,
    artifactType: "diagram_xml",
    fileName: input.fileName ?? "import.drawio",
    mimeType: "application/xml",
    data: Buffer.from(validation.xml, "utf8"),
    metadata: {
      pipelineName: "diagram-import",
      sourceFormat: sourceIsMermaid ? "mermaid" : "drawio",
      repairApplied: validation.repairApplied,
      notes: validation.notes
    }
  });

  await updateVersionStructuredState({
    versionId: version.id,
    diagramModel,
    metadata: {
      pipelineName: "diagram-import",
      status: "completed",
      artifactId: artifact.id,
      sourceFormat: sourceIsMermaid ? "mermaid" : "drawio",
      repairApplied: validation.repairApplied
    }
  });

  return {
    versionId: version.id,
    diagramModel,
    xml: validation.xml,
    artifactId: artifact.id,
    repairApplied: validation.repairApplied,
    notes: validation.notes
  };
}

export async function runDiagramImageReconstructionPipeline(
  input: DiagramImageReconstructionWorkflowInput
): Promise<DiagramImportWorkflowResult> {
  const models = getOpenAIModelConfig();
  const prompt =
    input.prompt?.trim() ||
    "Reconstruct this reference image as a clean editable Draw.io diagram. Preserve all visible text, icons, containers, and connectors as separate editable objects.";
  const version = await createVersionStep({
    sessionId: input.sessionId,
    parentVersionId: input.parentVersionId,
    stepType: "upload",
    mode: "diagram",
    prompt,
    metadata: {
      pipelineName: "diagram-image-reconstruction",
      status: "started",
      fileName: input.fileName,
      mimeType: input.mimeType ?? "image/png"
    }
  });
  const traceBase = {
    sessionId: input.sessionId,
    versionId: version.id,
    pipelineName: "diagram-image-reconstruction"
  };

  const sourceArtifact = await persistArtifactForVersion({
    sessionId: input.sessionId,
    versionId: version.id,
    artifactType: "source",
    fileName: input.fileName ?? "reference-image.png",
    mimeType: input.mimeType ?? "image/png",
    data: input.image,
    metadata: {
      pipelineName: "diagram-image-reconstruction",
      role: "reference-image"
    }
  });

  const { result: diagramSpec } = await runTracedStage(
    {
      ...traceBase,
      stageName: "openai-reference-image-to-diagram-spec",
      inputSummary: summarizeForTrace({
        prompt,
        imageBytes: input.image.byteLength,
        mimeType: input.mimeType ?? "image/png"
      }),
      modelUsed: models.textModel
    },
    () => openAIWorkflowService.generateDiagramSpecFromImage(input.image, prompt, "editable reference reconstruction", input.mimeType ?? "image/png")
  );

  const diagramModel = createDiagramModelFromSpec(diagramSpec);
  const generatedXml = createDrawioXmlFromModel(diagramModel);
  const validation = validateAndRepairDrawioXml(generatedXml);

  if (!validation.valid) {
    throw new Error(`Image reconstruction produced invalid XML: ${validation.errors.join(" ")}`);
  }

  const artifact = await persistArtifactForVersion({
    sessionId: input.sessionId,
    versionId: version.id,
    artifactType: "diagram_xml",
    fileName: "reconstructed.drawio",
    mimeType: "application/xml",
    data: Buffer.from(validation.xml, "utf8"),
    metadata: {
      pipelineName: "diagram-image-reconstruction",
      sourceArtifactId: sourceArtifact.id,
      repairApplied: validation.repairApplied,
      notes: validation.notes
    }
  });

  await updateVersionStructuredState({
    versionId: version.id,
    diagramModel,
    metadata: {
      pipelineName: "diagram-image-reconstruction",
      status: "completed",
      artifactId: artifact.id,
      sourceArtifactId: sourceArtifact.id,
      repairApplied: validation.repairApplied
    },
    previewArtifactId: artifact.id
  });

  return {
    versionId: version.id,
    diagramModel,
    xml: validation.xml,
    artifactId: artifact.id,
    repairApplied: validation.repairApplied,
    notes: validation.notes
  };
}

export async function runDiagramGenerationPipeline(
  input: DiagramGenerationWorkflowInput
): Promise<DiagramGenerationWorkflowResult> {
  const models = getOpenAIModelConfig();
  const googleModels = getGoogleImageModelConfig();
  const imageProvider = input.imageProvider ?? defaultDiagramImageProvider();
  const visualDraftProvider = imageProvider === "gemini" ? "gemini" : "none";
  const version = await createVersionStep({
    sessionId: input.sessionId,
    parentVersionId: input.parentVersionId,
    stepType: "prompt",
    mode: "diagram",
    prompt: input.prompt,
    metadata: {
      pipelineName: "diagram-generation",
      status: "started",
      requestedDiagramType: input.diagramType,
      imageProvider,
      visualDraftProvider,
      diagramTypeSource: "openai-inferred"
    }
  });

  const traceBase = {
    sessionId: input.sessionId,
    versionId: version.id,
    pipelineName: "diagram-generation"
  };

  const expandedDiagramPrompt = (
    await runTracedStage(
      {
        ...traceBase,
        stageName: "infer-and-expand-diagram-prompt",
        inputSummary: summarizeForTrace({ prompt: input.prompt, requestedDiagramType: input.diagramType }),
        modelUsed: models.textModel
      },
      () => openAIWorkflowService.inferAndExpandDiagramPrompt(input.prompt)
    )
  ).result;

  const inferredDiagramType = expandedDiagramPrompt.diagramType;
  const expandedPrompt = expandedDiagramPrompt.expandedPrompt;
  const generationPrompt = expandedPrompt;

  let visualDraft:
    | {
        image: Buffer;
        mimeType: string;
        modelUsed: string;
        text?: string;
      }
    | undefined;
  let visualDraftError: string | undefined;

  if (visualDraftProvider === "gemini") {
    try {
      visualDraft = (
        await runTracedStage(
          {
            ...traceBase,
            stageName: "generate-gemini-visual-draft-image",
            inputSummary: summarizeForTrace({ prompt: generationPrompt, diagramType: inferredDiagramType, provider: "gemini" }),
            modelUsed: googleModels.imageModel
          },
          () => googleImageClient.generateImage(diagramVisualDraftPrompt(generationPrompt, inferredDiagramType)),
          (result) => summarizeForTrace({ bytes: result.image.byteLength, mimeType: result.mimeType })
        )
      ).result;
    } catch (error) {
      visualDraftError = (error as Error).message;
    }
  }

  const visualDraftArtifact = visualDraft
    ? await persistArtifactForVersion({
        sessionId: input.sessionId,
        versionId: version.id,
        artifactType: "preview",
        fileName: "diagram-visual-draft.png",
        mimeType: visualDraft.mimeType,
        data: visualDraft.image,
        metadata: {
          pipelineName: "diagram-generation",
          role: "visual-draft",
          provider: "gemini",
          modelUsed: visualDraft.modelUsed,
          text: "text" in visualDraft ? visualDraft.text : undefined
        }
      })
    : undefined;

  let { result: diagramSpec } = await runTracedStage(
    {
      ...traceBase,
      stageName: visualDraft ? "visual-draft-to-openai-diagram-spec" : "openai-direct-diagram-spec",
      inputSummary: summarizeForTrace({
        prompt: generationPrompt,
        diagramType: inferredDiagramType,
        hasVisualDraft: Boolean(visualDraft),
        visualDraftError,
        extractionRoute: visualDraft
          ? "diagram image + extraction prompt -> OpenAI"
          : "expanded prompt -> OpenAI structured DiagramSpec"
      }),
      modelUsed: models.textModel
    },
    () =>
      visualDraft
        ? openAIWorkflowService.generateDiagramSpecFromImage(
            visualDraft.image,
            generationPrompt,
            inferredDiagramType,
            visualDraft.mimeType
          )
        : openAIWorkflowService.generateDiagramSpec(generationPrompt)
  );

  let { result: diagramModel } = await runTracedStage(
    {
      ...traceBase,
      stageName: "spec-to-diagram-model",
      inputSummary: summarizeForTrace(diagramSpec)
    },
    async () => createDiagramModelFromSpec(diagramSpec)
  );

  let { result: generatedXml } = await runTracedStage(
    {
      ...traceBase,
      stageName: "diagram-model-to-xml",
      inputSummary: summarizeForTrace(diagramModel)
    },
    async () => createDrawioXmlFromModel(diagramModel),
    (xml) => summarizeForTrace({ xmlLength: xml.length })
  );

  let { result: validation } = await runTracedStage(
    {
      ...traceBase,
      stageName: "validate-and-repair-xml",
      inputSummary: summarizeForTrace({ xmlLength: generatedXml.length })
    },
    async () => validateAndRepairDrawioXml(generatedXml)
  );

  const renderedDiagramSvg = createDiagramSvgFromModel(diagramModel);
  const renderedDiagramArtifact = await persistArtifactForVersion({
    sessionId: input.sessionId,
    versionId: version.id,
    artifactType: "preview",
    fileName: "diagram-rendered.svg",
    mimeType: "image/svg+xml",
    data: Buffer.from(renderedDiagramSvg, "utf8"),
    metadata: {
      pipelineName: "diagram-generation",
      role: "rendered-verification-snapshot",
      source: "diagram-model"
    }
  });

  const verificationEnabled = process.env.DIAGRAM_VERIFICATION_ENABLED !== "false";
  let verification:
    | {
        matchesIntent: boolean;
        confidence: number;
        issues: string[];
        correctionSummary: string;
      }
    | undefined;
  let verificationRepairApplied = false;
  let verificationAppliedCorrections: string[] = [];

  if (verificationEnabled) {
    try {
      const renderedDiagramPng = await rasterizeSvgToPng(renderedDiagramSvg);
      const verificationResult = (
        await runTracedStage(
          {
            ...traceBase,
            stageName: "verify-rendered-diagram",
            inputSummary: summarizeForTrace({
              prompt: generationPrompt,
              diagramType: inferredDiagramType,
              renderedDiagramArtifactId: renderedDiagramArtifact.id,
              renderedImageFormat: renderedDiagramPng ? "image/png" : "structured-spec-only"
            }),
            modelUsed: models.textModel
          },
          () =>
            openAIWorkflowService.verifyDiagramAgainstPrompt(
              renderedDiagramPng ?? Buffer.alloc(0),
              generationPrompt,
              diagramSpec,
              inferredDiagramType,
              renderedDiagramPng ? "image/png" : "application/json"
            )
        )
      ).result;

      verification = {
        matchesIntent: verificationResult.matchesIntent,
        confidence: verificationResult.confidence,
        issues: verificationResult.issues,
        correctionSummary: verificationResult.correctionSummary
      };

      if (!verificationResult.matchesIntent) {
        const correction = applySafeDiagramCorrections(diagramSpec, verificationResult.safeCorrections);
        verificationAppliedCorrections = correction.applied;
        verificationRepairApplied = correction.applied.length > 0;
        diagramSpec = correction.spec;
        diagramModel = applySafeCorrectionsToModel(diagramModel, verificationResult.safeCorrections);
        generatedXml = createDrawioXmlFromModel(diagramModel);
        validation = validateAndRepairDrawioXml(generatedXml);
      }
    } catch (error) {
      verification = {
        matchesIntent: true,
        confidence: 0,
        issues: [`Verification skipped: ${(error as Error).message}`],
        correctionSummary: "The generated diagram was preserved because verification could not complete."
      };
    }
  }

  const artifact = await persistArtifactForVersion({
    sessionId: input.sessionId,
    versionId: version.id,
    artifactType: "diagram_xml",
    fileName: "diagram.drawio",
    mimeType: "application/xml",
    data: Buffer.from(validation.xml, "utf8"),
    metadata: {
      pipelineName: "diagram-generation",
      diagramType: inferredDiagramType,
      diagramTypeInference: {
        diagramType: expandedDiagramPrompt.diagramType,
        confidence: expandedDiagramPrompt.confidence,
        reasoningSummary: expandedDiagramPrompt.reasoningSummary,
        expertFraming: expandedDiagramPrompt.expertFraming
      },
      expandedPrompt,
      visualDraftArtifactId: visualDraftArtifact?.id,
      visualDraftProvider,
      visualDraftError,
      renderedDiagramArtifactId: renderedDiagramArtifact.id,
      imageProvider,
      verification,
      verificationRepairApplied,
      verificationAppliedCorrections,
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
      diagramType: inferredDiagramType,
      diagramTypeInference: {
        diagramType: expandedDiagramPrompt.diagramType,
        confidence: expandedDiagramPrompt.confidence,
        reasoningSummary: expandedDiagramPrompt.reasoningSummary,
        expertFraming: expandedDiagramPrompt.expertFraming
      },
      expandedPrompt,
      visualDraftArtifactId: visualDraftArtifact?.id,
      visualDraftProvider,
      visualDraftError,
      renderedDiagramArtifactId: renderedDiagramArtifact.id,
      imageProvider,
      verification,
      verificationRepairApplied,
      verificationAppliedCorrections,
      repairApplied: validation.repairApplied
    }
  });

  return {
    versionId: version.id,
    inferredDiagramType,
    expandedPrompt,
    visualDraftArtifactId: visualDraftArtifact?.id,
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

  const diagramModel = parseDrawioXmlToDiagramModel(validation.xml);

  await updateVersionStructuredState({
    versionId: version.id,
    parsedIntent,
    editingAnalysis,
    diagramModel,
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
    diagramModel,
    xml: validation.xml,
    repairApplied: validation.repairApplied,
    artifactId: artifact.id
  };
}

export async function runDiagramDirectEditPipeline(
  input: DiagramDirectEditWorkflowInput
): Promise<DiagramDirectEditWorkflowResult> {
  const version = await createVersionStep({
    sessionId: input.sessionId,
    parentVersionId: input.parentVersionId,
    stepType: "direct-edit",
    mode: "diagram",
    diagramModel: input.diagramModel,
    metadata: {
      pipelineName: "diagram-direct-edit",
      status: "started",
      operationCount: input.operations.length
    }
  });

  const diagramModel = applyDirectDiagramEdits(input.diagramModel, input.operations);
  const xml = createDrawioXmlFromModel(diagramModel);
  const validation = validateAndRepairDrawioXml(xml);

  if (!validation.valid) {
    throw new Error(`Direct edit produced invalid XML: ${validation.errors.join(" ")}`);
  }

  const artifact = await persistArtifactForVersion({
    sessionId: input.sessionId,
    versionId: version.id,
    artifactType: "diagram_xml",
    fileName: "diagram-direct-edit.drawio",
    mimeType: "application/xml",
    data: Buffer.from(validation.xml, "utf8"),
    metadata: {
      pipelineName: "diagram-direct-edit",
      operationCount: input.operations.length,
      repairApplied: validation.repairApplied
    }
  });

  await updateVersionStructuredState({
    versionId: version.id,
    diagramModel,
    metadata: {
      pipelineName: "diagram-direct-edit",
      status: "completed",
      artifactId: artifact.id,
      operationCount: input.operations.length
    }
  });

  return {
    versionId: version.id,
    diagramModel,
    xml: validation.xml,
    artifactId: artifact.id,
    operations: input.operations
  };
}
