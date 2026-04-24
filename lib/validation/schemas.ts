import { z } from "zod";

export const editorModeSchema = z.enum(["diagram", "image"]);
export const imageGenerationProviderSchema = z.enum(["openai", "gemini"]);

export const editActionTypeSchema = z.enum([
  "add",
  "remove",
  "rename",
  "recolor",
  "move",
  "connect",
  "disconnect",
  "generate",
  "edit"
]);

export const editTargetTypeSchema = z.enum([
  "node",
  "edge",
  "group",
  "region",
  "diagram",
  "image"
]);

export const spatialHintsSchema = z.object({
  relation: z.enum(["above", "below", "left-of", "right-of", "inside", "near"]).optional(),
  referenceSelector: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  freeform: z.string().optional()
});

export const parsedEditIntentSchema = z.object({
  mode: editorModeSchema,
  actionType: editActionTypeSchema,
  targetType: editTargetTypeSchema,
  targetSelectors: z.array(z.string()),
  attributes: z.record(z.unknown()),
  spatialHints: spatialHintsSchema.optional(),
  confidence: z.number().min(0).max(1),
  rawPrompt: z.string()
});

export const boundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number()
});

export const diagramSpecSchema = z.object({
  title: z.string(),
  diagramType: z.string(),
  nodes: z.array(
    z.object({
      id: z.string().optional(),
      label: z.string(),
      type: z.string().optional(),
      groupId: z.string().optional(),
      attributes: z.record(z.unknown()).optional()
    })
  ),
  edges: z.array(
    z.object({
      id: z.string().optional(),
      sourceId: z.string(),
      targetId: z.string(),
      label: z.string().optional(),
      attributes: z.record(z.unknown()).optional()
    })
  ),
  groups: z.array(
    z.object({
      id: z.string().optional(),
      label: z.string(),
      nodeIds: z.array(z.string()),
      attributes: z.record(z.unknown()).optional()
    })
  ),
  layoutHints: z.record(z.unknown()),
  styleHints: z.record(z.unknown())
});

const diagramNodeModelSchema = z.object({
  id: z.string(),
  stableId: z.string(),
  label: z.string(),
  type: z.string().optional(),
  groupId: z.string().optional(),
  boundingBox: boundingBoxSchema.optional(),
  style: z.record(z.unknown()),
  data: z.record(z.unknown())
});

const diagramEdgeModelSchema = z.object({
  id: z.string(),
  stableId: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  label: z.string().optional(),
  style: z.record(z.unknown()),
  data: z.record(z.unknown())
});

const diagramGroupModelSchema = z.object({
  id: z.string(),
  stableId: z.string(),
  label: z.string(),
  nodeIds: z.array(z.string()),
  boundingBox: boundingBoxSchema.optional(),
  style: z.record(z.unknown())
});

export const diagramModelSchema = z.object({
  nodes: z.array(diagramNodeModelSchema),
  edges: z.array(diagramEdgeModelSchema),
  groups: z.array(diagramGroupModelSchema),
  layoutMetadata: z.record(z.unknown()),
  styleMetadata: z.record(z.unknown()),
  sourceXml: z.string().optional(),
  normalized: z.record(z.unknown())
});

export const editingAnalysisSchema = z.object({
  parsedIntent: parsedEditIntentSchema,
  matchedTargets: z.array(
    z.object({
      id: z.string(),
      targetType: editTargetTypeSchema,
      label: z.string().optional(),
      confidence: z.number().min(0).max(1),
      reason: z.string()
    })
  ),
  ambiguityFlags: z.array(z.string()),
  selectedOperationPlan: z.array(
    z.object({
      operation: editActionTypeSchema,
      targetIds: z.array(z.string()),
      attributes: z.record(z.unknown()),
      notes: z.string().optional()
    })
  ),
  validationNotes: z.array(z.string()),
  fallbackBehavior: z.string().optional(),
  executionRoute: z.enum(["diagram-xml", "diagram-model", "image-generation", "image-edit"])
});

export const diagramTargetAnalysisSchema = z.object({
  matchedTargets: z.array(
    z.object({
      id: z.string(),
      targetType: editTargetTypeSchema,
      label: z.string().optional(),
      confidence: z.number().min(0).max(1),
      reason: z.string()
    })
  ),
  unmatchedSelectors: z.array(z.string()),
  ambiguityFlags: z.array(z.string()),
  notes: z.array(z.string())
});

export const xmlStringResponseSchema = z.object({
  xml: z.string().min(1)
});

export const xmlValidationRepairResponseSchema = z.object({
  xml: z.string().min(1),
  repairApplied: z.boolean(),
  notes: z.array(z.string())
});

export const diagramTypeInferenceSchema = z.object({
  diagramType: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reasoningSummary: z.string().default(""),
  expertFraming: z.string().default("")
});

export const expandedDiagramPromptSchema = diagramTypeInferenceSchema.extend({
  expandedPrompt: z.string().min(1)
});

export const diagramVerificationResponseSchema = z.object({
  matchesIntent: z.boolean(),
  confidence: z.number().min(0).max(1),
  issues: z.array(z.string()).default([]),
  correctionSummary: z.string().default(""),
  safeCorrections: z
    .object({
      nodeLabels: z.record(z.string()).default({}),
      edgeLabels: z.record(z.string()).default({}),
      groupLabels: z.record(z.string()).default({}),
      nodeTypes: z.record(z.string()).default({}),
      nodeIcons: z.record(z.string()).default({}),
      notes: z.array(z.string()).default([])
    })
    .default({
      nodeLabels: {},
      edgeLabels: {},
      groupLabels: {},
      nodeTypes: {},
      nodeIcons: {},
      notes: []
    })
});

export const diagramGenerateWorkflowRequestSchema = z.object({
  sessionId: z.string().cuid(),
  prompt: z.string().min(1),
  diagramType: z.string().min(1).max(80).optional(),
  imageProvider: imageGenerationProviderSchema.optional(),
  parentVersionId: z.string().cuid().nullable().optional()
});

export const diagramEditWorkflowRequestSchema = z.object({
  sessionId: z.string().cuid(),
  prompt: z.string().min(1),
  existingXml: z.string().min(1),
  diagramModel: diagramModelSchema,
  parentVersionId: z.string().cuid().nullable().optional()
});

export const imageGenerateWorkflowRequestSchema = z.object({
  sessionId: z.string().cuid(),
  prompt: z.string().min(1),
  imageProvider: imageGenerationProviderSchema.optional(),
  parentVersionId: z.string().cuid().nullable().optional()
});

export const diagramImportRequestSchema = z.object({
  sessionId: z.string().cuid(),
  xml: z.string().min(1),
  fileName: z.string().min(1).default("import.drawio"),
  parentVersionId: z.string().cuid().nullable().optional()
});

export const directDiagramEditOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("rename-node"),
    nodeId: z.string().min(1),
    label: z.string().min(1)
  }),
  z.object({
    type: z.literal("move-node"),
    nodeId: z.string().min(1),
    x: z.number(),
    y: z.number()
  }),
  z.object({
    type: z.literal("resize-node"),
    nodeId: z.string().min(1),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().min(1),
    height: z.number().min(1)
  }),
  z.object({
    type: z.literal("add-node"),
    node: z.object({
      id: z.string().optional(),
      label: z.string().min(1),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      type: z.string().min(1).optional(),
      groupId: z.string().optional(),
      style: z.record(z.unknown()).optional()
    })
  }),
  z.object({
    type: z.literal("delete-node"),
    nodeId: z.string().min(1)
  }),
  z.object({
    type: z.literal("update-node-style"),
    nodeId: z.string().min(1),
    style: z.record(z.unknown())
  }),
  z.object({
    type: z.literal("update-node-fields"),
    nodeId: z.string().min(1),
    label: z.string().min(1).optional(),
    nodeType: z.string().min(1).optional(),
    groupId: z.string().min(1).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().min(1).optional(),
    height: z.number().min(1).optional(),
    style: z.record(z.unknown()).optional(),
    data: z.record(z.unknown()).optional()
  }),
  z.object({
    type: z.literal("add-edge"),
    edge: z.object({
      id: z.string().optional(),
      sourceId: z.string().min(1),
      targetId: z.string().min(1),
      label: z.string().optional(),
      style: z.record(z.unknown()).optional()
    })
  }),
  z.object({
    type: z.literal("delete-edge"),
    edgeId: z.string().min(1)
  }),
  z.object({
    type: z.literal("update-edge-style"),
    edgeId: z.string().min(1),
    style: z.record(z.unknown())
  }),
  z.object({
    type: z.literal("update-edge-label"),
    edgeId: z.string().min(1),
    label: z.string().optional()
  }),
  z.object({
    type: z.literal("update-edge-fields"),
    edgeId: z.string().min(1),
    label: z.string().optional(),
    sourceId: z.string().min(1).optional(),
    targetId: z.string().min(1).optional(),
    style: z.record(z.unknown()).optional(),
    data: z.record(z.unknown()).optional()
  }),
  z.object({
    type: z.literal("reconnect-edge"),
    edgeId: z.string().min(1),
    sourceId: z.string().min(1).optional(),
    targetId: z.string().min(1).optional()
  }),
  z.object({
    type: z.literal("add-group"),
    group: z.object({
      id: z.string().optional(),
      label: z.string().min(1),
      nodeIds: z.array(z.string().min(1)).optional(),
      style: z.record(z.unknown()).optional()
    })
  }),
  z.object({
    type: z.literal("update-group"),
    groupId: z.string().min(1),
    label: z.string().min(1).optional(),
    style: z.record(z.unknown()).optional()
  }),
  z.object({
    type: z.literal("delete-group"),
    groupId: z.string().min(1),
    ungroupNodes: z.boolean().optional()
  }),
  z.object({
    type: z.literal("set-node-group"),
    nodeId: z.string().min(1),
    groupId: z.string().min(1).optional()
  })
]);

export const diagramDirectEditWorkflowRequestSchema = z.object({
  sessionId: z.string().cuid(),
  diagramModel: diagramModelSchema,
  operations: z.array(directDiagramEditOperationSchema).min(1),
  parentVersionId: z.string().cuid().nullable().optional()
});

export const imageEditWorkflowRequestSchema = z.object({
  sessionId: z.string().cuid(),
  prompt: z.string().min(1),
  imageBase64: z.string().min(1),
  maskBase64: z.string().min(1).optional(),
  imageProvider: imageGenerationProviderSchema.optional(),
  parentVersionId: z.string().cuid().nullable().optional()
});

export const uploadRequestMetadataSchema = z.object({
  sessionId: z.string().cuid(),
  artifactType: z.enum(["image", "diagram_xml", "preview", "mask", "source"]).default("source"),
  versionId: z.string().cuid().optional(),
  mode: editorModeSchema.default("diagram"),
  fileName: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional()
});

export const uploadJsonRequestSchema = uploadRequestMetadataSchema.extend({
  dataBase64: z.string().min(1)
});

export const createSessionRequestSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  initialMode: editorModeSchema.default("diagram")
});

export const createVersionStepRequestSchema = z.object({
  sessionId: z.string().cuid(),
  parentVersionId: z.string().cuid().nullable().optional(),
  stepType: z.enum(["create", "upload", "prompt", "direct-edit", "revert", "system"]),
  mode: editorModeSchema,
  prompt: z.string().nullable().optional(),
  parsedIntent: parsedEditIntentSchema.nullable().optional(),
  editingAnalysis: editingAnalysisSchema.nullable().optional(),
  diagramModel: diagramModelSchema.nullable().optional(),
  imageMetadata: z.record(z.unknown()).nullable().optional(),
  metadata: z.record(z.unknown()).optional()
});

export const revertSessionRequestSchema = z.object({
  versionId: z.string().cuid()
});

export const artifactRecordSchema = z.object({
  artifactType: z.enum(["image", "diagram_xml", "preview", "mask", "source"]),
  storagePath: z.string(),
  mimeType: z.string(),
  versionId: z.string().cuid(),
  metadata: z.record(z.unknown()).default({})
});
