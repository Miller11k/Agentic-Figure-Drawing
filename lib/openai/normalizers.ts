import type {
  DiagramModel,
  DiagramTargetAnalysis,
  EditingAnalysis,
  EditorMode,
  ParsedEditIntent
} from "@/types";

const ACTIONS = ["add", "remove", "rename", "recolor", "move", "connect", "disconnect", "generate", "edit"] as const;
const TARGETS = ["node", "edge", "group", "region", "diagram", "image"] as const;
const EXECUTION_ROUTES = ["diagram-xml", "diagram-model", "image-generation", "image-edit"] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function asStringArray(value: unknown): string[] {
  return asArray(value)
    .map((item) => (typeof item === "string" ? item : String(item)))
    .map((item) => item.trim())
    .filter(Boolean);
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function asConfidence(value: unknown, fallback = 0.5): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric > 1 && numeric <= 100) return Math.max(0, Math.min(1, numeric / 100));
  return Math.max(0, Math.min(1, numeric));
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
  aliases: Record<string, T[number]> = {}
): T[number] {
  const normalized = asString(value, fallback).trim().toLowerCase().replaceAll("_", "-").replace(/\s+/g, "-");
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T[number]) : aliases[normalized] ?? fallback;
}

function unwrap(value: unknown, keys: string[]): unknown {
  const record = asRecord(value);
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return value;
}

function normalizeSpatialHints(value: unknown) {
  const hints = asRecord(value);
  if (Object.keys(hints).length === 0) return undefined;

  const relation = enumValue(hints.relation, ["above", "below", "left-of", "right-of", "inside", "near"] as const, "near", {
    left: "left-of",
    right: "right-of",
    under: "below",
    beneath: "below"
  });

  return {
    ...hints,
    relation,
    referenceSelector: hints.referenceSelector ? asString(hints.referenceSelector) : undefined,
    x: hints.x === undefined ? undefined : Number(hints.x),
    y: hints.y === undefined ? undefined : Number(hints.y),
    width: hints.width === undefined ? undefined : Number(hints.width),
    height: hints.height === undefined ? undefined : Number(hints.height),
    freeform: hints.freeform ? asString(hints.freeform) : undefined
  };
}

export function normalizeParsedEditIntent(value: unknown, fallback: { prompt: string; mode: EditorMode }): ParsedEditIntent {
  const record = asRecord(unwrap(value, ["parsedIntent", "intent", "result"]));
  const attributes = asRecord(record.attributes);
  const targetSelectors = asStringArray(
    record.targetSelectors ?? record.targets ?? record.target ?? record.selector ?? record.selectors
  );

  return {
    mode: enumValue(record.mode, ["diagram", "image"] as const, fallback.mode),
    actionType: enumValue(record.actionType ?? record.action, ACTIONS, fallback.prompt ? "edit" : "generate", {
      delete: "remove",
      create: "add",
      color: "recolor",
      colour: "recolor",
      recolour: "recolor",
      link: "connect",
      unlink: "disconnect"
    }),
    targetType: enumValue(record.targetType ?? record.type, TARGETS, fallback.mode === "diagram" ? "diagram" : "image", {
      shape: "node",
      connector: "edge",
      connection: "edge",
      mask: "region"
    }),
    targetSelectors,
    attributes,
    spatialHints: normalizeSpatialHints(record.spatialHints ?? record.location ?? record.position),
    confidence: asConfidence(record.confidence),
    rawPrompt: asString(record.rawPrompt ?? record.prompt, fallback.prompt)
  };
}

function normalizeMatchedTarget(value: unknown) {
  const record = asRecord(value);
  return {
    id: asString(record.id ?? record.targetId ?? record.stableId),
    targetType: enumValue(record.targetType ?? record.type, TARGETS, "node", {
      shape: "node",
      connector: "edge",
      connection: "edge"
    }),
    label: record.label === undefined ? undefined : asString(record.label),
    confidence: asConfidence(record.confidence),
    reason: asString(record.reason ?? record.rationale, "Matched by OpenAI target analysis.")
  };
}

export function normalizeDiagramTargetAnalysis(value: unknown): DiagramTargetAnalysis {
  const record = asRecord(unwrap(value, ["targetAnalysis", "analysis", "result"]));
  return {
    matchedTargets: asArray(record.matchedTargets ?? record.targets ?? record.matches).map(normalizeMatchedTarget),
    unmatchedSelectors: asStringArray(record.unmatchedSelectors ?? record.unmatched ?? record.missingSelectors),
    ambiguityFlags: asStringArray(record.ambiguityFlags ?? record.ambiguities ?? record.ambiguous),
    notes: asStringArray(record.notes ?? record.validationNotes)
  };
}

export function normalizeEditingAnalysis(
  value: unknown,
  fallback: {
    parsedIntent: ParsedEditIntent;
    targetAnalysis: DiagramTargetAnalysis;
  }
): EditingAnalysis {
  const record = asRecord(unwrap(value, ["editingAnalysis", "analysis", "result"]));
  const plan = asArray(record.selectedOperationPlan ?? record.operationPlan ?? record.operations).map((item) => {
    const step = asRecord(item);
    return {
      operation: enumValue(step.operation ?? step.actionType ?? step.action, ACTIONS, fallback.parsedIntent.actionType),
      targetIds: asStringArray(step.targetIds ?? step.targets ?? step.targetId),
      attributes: asRecord(step.attributes),
      notes: step.notes === undefined ? undefined : asString(step.notes)
    };
  });

  return {
    parsedIntent: normalizeParsedEditIntent(record.parsedIntent ?? fallback.parsedIntent, {
      prompt: fallback.parsedIntent.rawPrompt,
      mode: fallback.parsedIntent.mode
    }),
    matchedTargets: asArray(record.matchedTargets ?? fallback.targetAnalysis.matchedTargets).map(normalizeMatchedTarget),
    ambiguityFlags: asStringArray(record.ambiguityFlags ?? fallback.targetAnalysis.ambiguityFlags),
    selectedOperationPlan: plan,
    validationNotes: asStringArray(record.validationNotes ?? record.notes),
    fallbackBehavior: record.fallbackBehavior === undefined ? undefined : asString(record.fallbackBehavior),
    executionRoute: enumValue(record.executionRoute ?? record.route, EXECUTION_ROUTES, "diagram-xml", {
      xml: "diagram-xml",
      model: "diagram-model",
      image: "image-edit"
    })
  };
}

function normalizeSpecNodes(value: unknown) {
  return asArray(value).map((item, index) => {
    const record = asRecord(item);
    return {
      id: record.id === undefined ? undefined : asString(record.id),
      label: asString(record.label ?? record.name ?? record.title, `Node ${index + 1}`),
      type: record.type === undefined ? undefined : asString(record.type),
      groupId: record.groupId === undefined ? undefined : asString(record.groupId),
      attributes: Object.keys(asRecord(record.attributes ?? record.style)).length
        ? asRecord(record.attributes ?? record.style)
        : undefined
    };
  });
}

function normalizeSpecEdges(value: unknown) {
  return asArray(value).map((item, index) => {
    const record = asRecord(item);
    return {
      id: record.id === undefined ? undefined : asString(record.id),
      sourceId: asString(record.sourceId ?? record.source ?? record.from, `missing_source_${index + 1}`),
      targetId: asString(record.targetId ?? record.target ?? record.to, `missing_target_${index + 1}`),
      label: record.label === undefined ? undefined : asString(record.label),
      attributes: Object.keys(asRecord(record.attributes ?? record.style)).length
        ? asRecord(record.attributes ?? record.style)
        : undefined
    };
  });
}

function normalizeSpecGroups(value: unknown) {
  return asArray(value).map((item, index) => {
    const record = asRecord(item);
    return {
      id: record.id === undefined ? undefined : asString(record.id),
      label: asString(record.label ?? record.name, `Group ${index + 1}`),
      nodeIds: asStringArray(record.nodeIds ?? record.nodes ?? record.members),
      attributes: Object.keys(asRecord(record.attributes ?? record.style)).length
        ? asRecord(record.attributes ?? record.style)
        : undefined
    };
  });
}

export function normalizeDiagramSpec(value: unknown, prompt: string): unknown {
  const record = asRecord(unwrap(value, ["diagramSpec", "spec", "result"]));
  return {
    title: asString(record.title ?? record.name, prompt.slice(0, 80) || "Generated diagram"),
    diagramType: asString(record.diagramType ?? record.type, "architecture"),
    nodes: normalizeSpecNodes(record.nodes),
    edges: normalizeSpecEdges(record.edges),
    groups: normalizeSpecGroups(record.groups),
    layoutHints: asRecord(record.layoutHints ?? record.layout),
    styleHints: asRecord(record.styleHints ?? record.styles)
  };
}

export function normalizeXmlStringResponse(value: unknown): unknown {
  const record = asRecord(unwrap(value, ["result", "response"]));
  return {
    xml: asString(record.xml ?? record.drawioXml ?? record.diagramXml ?? value)
  };
}

export function normalizeXmlValidationRepairResponse(value: unknown, originalXml: string): unknown {
  const record = asRecord(unwrap(value, ["result", "validation", "repair"]));
  return {
    xml: asString(record.xml ?? record.repairedXml ?? originalXml),
    repairApplied:
      typeof record.repairApplied === "boolean"
        ? record.repairApplied
        : asString(record.repairApplied).toLowerCase() === "true",
    notes: asStringArray(record.notes ?? record.warnings ?? record.errors)
  };
}

export function fallbackDiagramTargetAnalysis(parsedIntent: ParsedEditIntent, diagramModel: DiagramModel): DiagramTargetAnalysis {
  const selectors = parsedIntent.targetSelectors.map((selector) => selector.toLowerCase());
  const matchedTargets = diagramModel.nodes
    .filter((node) => selectors.some((selector) => node.label.toLowerCase().includes(selector) || node.id.toLowerCase() === selector))
    .map((node) => ({
      id: node.id,
      targetType: "node" as const,
      label: node.label,
      confidence: 0.5,
      reason: "Deterministic fallback matched selector against node label or id."
    }));

  return {
    matchedTargets,
    unmatchedSelectors: matchedTargets.length > 0 ? [] : parsedIntent.targetSelectors,
    ambiguityFlags: [],
    notes: ["Used deterministic fallback target analysis after model output normalization."]
  };
}
