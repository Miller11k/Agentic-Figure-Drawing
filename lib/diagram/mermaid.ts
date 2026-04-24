import type { DiagramSpec } from "@/types";

type MermaidNodeShape = "rectangle" | "rounded" | "decision" | "database" | "circle";

interface MermaidNode {
  id: string;
  label: string;
  shape: MermaidNodeShape;
}

interface MermaidEdge {
  sourceId: string;
  targetId: string;
  label?: string;
}

const DIAGRAM_DECLARATION = /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram)\b/i;

export function isMermaidDiagram(source: string): boolean {
  const trimmed = source.trim();
  if (!trimmed || trimmed.startsWith("<")) return false;
  return DIAGRAM_DECLARATION.test(trimmed) || /-->|---|==>|-\.-|->>|-->>|:/.test(trimmed);
}

function cleanLine(line: string) {
  return line
    .replace(/^\s*%%.*$/, "")
    .replace(/^\s*#.*$/, "")
    .trim();
}

function normalizeId(value: string) {
  return value
    .replace(/["'`]/g, "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function titleCase(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stripNodeSyntax(token: string): MermaidNode {
  const trimmed = token.trim().replace(/;$/, "");
  const idMatch = trimmed.match(/^([A-Za-z0-9_.$:-]+)\s*(.*)$/);
  const rawId = idMatch?.[1] ?? trimmed;
  const rest = idMatch?.[2]?.trim() ?? "";
  const id = normalizeId(rawId) || `node-${Math.abs(hashString(trimmed))}`;

  const shapePatterns: Array<{ pattern: RegExp; shape: MermaidNodeShape }> = [
    { pattern: /^\[\((.*)\)\]$/, shape: "database" },
    { pattern: /^\(\((.*)\)\)$/, shape: "circle" },
    { pattern: /^\{(.*)\}$/, shape: "decision" },
    { pattern: /^\((.*)\)$/, shape: "rounded" },
    { pattern: /^\[(.*)\]$/, shape: "rectangle" }
  ];

  for (const item of shapePatterns) {
    const match = rest.match(item.pattern);
    if (match) {
      return { id, label: decodeMermaidLabel(match[1] ?? rawId), shape: item.shape };
    }
  }

  const quoted = rest.match(/^["'](.+)["']$/);
  return {
    id,
    label: decodeMermaidLabel(quoted?.[1] ?? rawId),
    shape: "rectangle"
  };
}

function decodeMermaidLabel(value: string) {
  return value.replace(/<br\s*\/?>/gi, "\n").replace(/&quot;/g, "\"").trim();
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

function addNode(nodes: Map<string, MermaidNode>, node: MermaidNode) {
  const existing = nodes.get(node.id);
  if (!existing || existing.label === titleCase(existing.id)) {
    nodes.set(node.id, node);
  }
}

function parseGraphLine(line: string, nodes: Map<string, MermaidNode>, edges: MermaidEdge[]) {
  const edgeMatch = line.match(/^(.+?)\s*(-\.->|-->|---|==>|--o|--x|<-->|<--|--)\s*(?:\|([^|]+)\|\s*)?(.+)$/);
  if (!edgeMatch) {
    const node = stripNodeSyntax(line);
    addNode(nodes, node);
    return;
  }

  const source = stripNodeSyntax(edgeMatch[1] ?? "");
  const target = stripNodeSyntax(edgeMatch[4] ?? "");
  addNode(nodes, source);
  addNode(nodes, target);
  edges.push({
    sourceId: source.id,
    targetId: target.id,
    label: edgeMatch[3]?.trim()
  });
}

function parseSequenceLine(line: string, nodes: Map<string, MermaidNode>, edges: MermaidEdge[]) {
  const participantMatch = line.match(/^participant\s+(.+?)(?:\s+as\s+(.+))?$/i);
  if (participantMatch) {
    const id = normalizeId(participantMatch[1] ?? "");
    if (id) addNode(nodes, { id, label: decodeMermaidLabel(participantMatch[2] ?? participantMatch[1] ?? id), shape: "rounded" });
    return;
  }

  const messageMatch = line.match(/^(.+?)\s*(-{1,2}>+|\){0,1}-->>|->>)\s*(.+?)(?::\s*(.+))?$/);
  if (!messageMatch) return;

  const source = stripNodeSyntax(messageMatch[1] ?? "");
  const target = stripNodeSyntax(messageMatch[3] ?? "");
  addNode(nodes, { ...source, shape: "rounded" });
  addNode(nodes, { ...target, shape: "rounded" });
  edges.push({ sourceId: source.id, targetId: target.id, label: messageMatch[4]?.trim() });
}

function parseClassOrStateLine(line: string, nodes: Map<string, MermaidNode>, edges: MermaidEdge[]) {
  const classMatch = line.match(/^class\s+([A-Za-z0-9_.$:-]+)/i);
  if (classMatch) {
    const id = normalizeId(classMatch[1] ?? "");
    if (id) addNode(nodes, { id, label: titleCase(id), shape: "rectangle" });
    return;
  }

  const stateMatch = line.match(/^state\s+["']?(.+?)["']?\s+as\s+([A-Za-z0-9_.$:-]+)/i);
  if (stateMatch) {
    const id = normalizeId(stateMatch[2] ?? "");
    if (id) addNode(nodes, { id, label: decodeMermaidLabel(stateMatch[1] ?? id), shape: "rounded" });
    return;
  }

  const edgeMatch = line.match(/^(.+?)\s+(-->|<--|\.\.>|--\*|\*--|<\|--|--\|>|o--|--o)\s+(.+?)(?::\s*(.+))?$/);
  if (!edgeMatch) return;

  const source = stripNodeSyntax(edgeMatch[1] ?? "");
  const target = stripNodeSyntax(edgeMatch[3] ?? "");
  addNode(nodes, source);
  addNode(nodes, target);
  edges.push({ sourceId: source.id, targetId: target.id, label: edgeMatch[4]?.trim() });
}

function nodeTypeForShape(shape: MermaidNodeShape) {
  if (shape === "database") return "database";
  if (shape === "decision") return "decision";
  return "process";
}

function styleForShape(shape: MermaidNodeShape) {
  if (shape === "database") return { fillColor: "#ecfeff", strokeColor: "#0891b2", shape: "cylinder" };
  if (shape === "decision") return { fillColor: "#fef9c3", strokeColor: "#ca8a04", shape: "rhombus" };
  if (shape === "circle") return { fillColor: "#eef2ff", strokeColor: "#4f46e5", shape: "ellipse" };
  return { fillColor: "#f8fafc", strokeColor: "#475569", rounded: shape === "rounded" };
}

export function parseMermaidToDiagramSpec(source: string, title = "Mermaid diagram"): DiagramSpec {
  const lines = source
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean)
    .filter((line) => !/^end$/i.test(line) && !/^subgraph\b/i.test(line));

  const declaration = lines[0]?.match(DIAGRAM_DECLARATION)?.[1] ?? "flowchart";
  const body = DIAGRAM_DECLARATION.test(lines[0] ?? "") ? lines.slice(1) : lines;
  const nodes = new Map<string, MermaidNode>();
  const edges: MermaidEdge[] = [];

  for (const line of body) {
    if (/^(style|classDef|linkStyle|click|direction|activate|deactivate|note)\b/i.test(line)) continue;
    if (/^sequenceDiagram/i.test(declaration)) {
      parseSequenceLine(line, nodes, edges);
    } else if (/^(classDiagram|stateDiagram)/i.test(declaration)) {
      parseClassOrStateLine(line, nodes, edges);
    } else {
      parseGraphLine(line, nodes, edges);
    }
  }

  return {
    title,
    diagramType: declaration.toLowerCase().includes("sequence")
      ? "sequence"
      : declaration.toLowerCase().includes("class")
        ? "class"
        : "flowchart",
    nodes: Array.from(nodes.values()).map((node) => ({
      id: node.id,
      label: node.label || titleCase(node.id),
      type: nodeTypeForShape(node.shape),
      attributes: styleForShape(node.shape)
    })),
    edges: edges.map((edge, index) => ({
      id: `edge-${index + 1}-${edge.sourceId}-${edge.targetId}`,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      label: edge.label
    })),
    groups: [],
    layoutHints: {
      direction: declaration.toLowerCase().includes("lr") ? "LR" : "TB",
      sourceFormat: "mermaid"
    },
    styleHints: {
      importedFrom: "mermaid"
    }
  };
}
