import { z } from "zod";

export const editorModeSchema = z.enum(["diagram", "image"]);

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

export const diagramGenerateWorkflowRequestSchema = z.object({
  sessionId: z.string().cuid(),
  prompt: z.string().min(1),
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
  parentVersionId: z.string().cuid().nullable().optional()
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
