export type EditorMode = "diagram" | "image";

export type EditActionType =
  | "add"
  | "remove"
  | "rename"
  | "recolor"
  | "move"
  | "connect"
  | "disconnect"
  | "generate"
  | "edit";

export type EditTargetType =
  | "node"
  | "edge"
  | "group"
  | "region"
  | "diagram"
  | "image";

export interface SpatialHints {
  relation?: "above" | "below" | "left-of" | "right-of" | "inside" | "near";
  referenceSelector?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  freeform?: string;
}

export interface ParsedEditIntent {
  mode: EditorMode;
  actionType: EditActionType;
  targetType: EditTargetType;
  targetSelectors: string[];
  attributes: Record<string, unknown>;
  spatialHints?: SpatialHints;
  confidence: number;
  rawPrompt: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiagramNodeSpec {
  id?: string;
  label: string;
  type?: string;
  groupId?: string;
  attributes?: Record<string, unknown>;
}

export interface DiagramEdgeSpec {
  id?: string;
  sourceId: string;
  targetId: string;
  label?: string;
  attributes?: Record<string, unknown>;
}

export interface DiagramGroupSpec {
  id?: string;
  label: string;
  nodeIds: string[];
  attributes?: Record<string, unknown>;
}

export interface DiagramSpec {
  title: string;
  diagramType: string;
  nodes: DiagramNodeSpec[];
  edges: DiagramEdgeSpec[];
  groups: DiagramGroupSpec[];
  layoutHints: Record<string, unknown>;
  styleHints: Record<string, unknown>;
}

export interface DiagramNodeModel {
  id: string;
  stableId: string;
  label: string;
  type?: string;
  groupId?: string;
  boundingBox?: BoundingBox;
  style: Record<string, unknown>;
  data: Record<string, unknown>;
}

export interface DiagramEdgeModel {
  id: string;
  stableId: string;
  sourceId: string;
  targetId: string;
  label?: string;
  style: Record<string, unknown>;
  data: Record<string, unknown>;
}

export interface DiagramGroupModel {
  id: string;
  stableId: string;
  label: string;
  nodeIds: string[];
  boundingBox?: BoundingBox;
  style: Record<string, unknown>;
}

export interface DiagramModel {
  nodes: DiagramNodeModel[];
  edges: DiagramEdgeModel[];
  groups: DiagramGroupModel[];
  layoutMetadata: Record<string, unknown>;
  styleMetadata: Record<string, unknown>;
  sourceXml?: string;
  normalized: Record<string, unknown>;
}

export interface MatchedTarget {
  id: string;
  targetType: EditTargetType;
  label?: string;
  confidence: number;
  reason: string;
}

export interface DiagramTargetAnalysis {
  matchedTargets: MatchedTarget[];
  unmatchedSelectors: string[];
  ambiguityFlags: string[];
  notes: string[];
}

export interface OperationPlanStep {
  operation: EditActionType;
  targetIds: string[];
  attributes: Record<string, unknown>;
  notes?: string;
}

export interface EditingAnalysis {
  parsedIntent: ParsedEditIntent;
  matchedTargets: MatchedTarget[];
  ambiguityFlags: string[];
  selectedOperationPlan: OperationPlanStep[];
  validationNotes: string[];
  fallbackBehavior?: string;
  executionRoute: "diagram-xml" | "diagram-model" | "image-generation" | "image-edit";
}
