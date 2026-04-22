import type {
  BoundingBox,
  DiagramEdgeModel,
  DiagramGroupModel,
  DiagramModel,
  DiagramNodeModel
} from "@/types";

export interface XmlValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface MxGeometry {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  relative?: string;
  as?: string;
}

interface MxCell {
  id: string;
  value?: string;
  style?: string;
  parent?: string;
  source?: string;
  target?: string;
  vertex?: string;
  edge?: string;
  geometry?: MxGeometry;
  rawAttributes: Record<string, string>;
}

const ROOT_CELL_IDS = new Set(["0", "1"]);
const DEFAULT_NODE_STYLE = "rounded=1;whiteSpace=wrap;html=1;";
const DEFAULT_GROUP_STYLE = "swimlane;whiteSpace=wrap;html=1;";
const DEFAULT_EDGE_STYLE = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;";

function decodeXml(value: string): string {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function encodeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([\w:-]+)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(source)) !== null) {
    attributes[match[1]] = decodeXml(match[2]);
  }

  return attributes;
}

function serializeAttributes(attributes: Record<string, string | number | undefined>): string {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}="${encodeXml(String(value))}"`)
    .join(" ");
}

function mxCellAttributesFromData(data: Record<string, unknown> | undefined): Record<string, string> {
  const mxCell = data?.mxCell;
  if (!mxCell || typeof mxCell !== "object" || Array.isArray(mxCell)) {
    return {};
  }

  const rawAttributes = (mxCell as { rawAttributes?: unknown }).rawAttributes;
  if (!rawAttributes || typeof rawAttributes !== "object" || Array.isArray(rawAttributes)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawAttributes as Record<string, unknown>)
      .filter(([, value]) => typeof value === "string")
      .map(([key, value]) => [key, value as string])
  );
}

function mxCellAttributesFromStyle(style: Record<string, unknown>): Record<string, string> {
  const rawAttributes = style.__mxCellRawAttributes;
  if (!rawAttributes || typeof rawAttributes !== "object" || Array.isArray(rawAttributes)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawAttributes as Record<string, unknown>)
      .filter(([, value]) => typeof value === "string")
      .map(([key, value]) => [key, value as string])
  );
}

function mergeMxCellAttributes(
  rawAttributes: Record<string, string>,
  explicit: Record<string, string | number | undefined>
): Record<string, string | number | undefined> {
  return {
    ...rawAttributes,
    ...explicit
  };
}

function numberFromAttribute(value: string | undefined): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boundingBoxFromGeometry(geometry?: MxGeometry): BoundingBox | undefined {
  if (!geometry) {
    return undefined;
  }

  return {
    x: geometry.x ?? 0,
    y: geometry.y ?? 0,
    width: geometry.width ?? 120,
    height: geometry.height ?? 60
  };
}

function styleToRecord(style: string | undefined): Record<string, unknown> {
  if (!style) {
    return {};
  }

  const result: Record<string, unknown> = { raw: style };

  for (const part of style.split(";")) {
    if (!part) {
      continue;
    }

    const [key, ...valueParts] = part.split("=");
    result[key] = valueParts.length > 0 ? valueParts.join("=") : true;
  }

  return result;
}

function styleFromRecord(style: Record<string, unknown>, fallback: string): string {
  if (typeof style.raw === "string") {
    return style.raw;
  }

  const entries = Object.entries(style)
    .filter(([key]) => key !== "raw" && key !== "__mxCellRawAttributes")
    .map(([key, value]) => (value === true ? key : `${key}=${String(value)}`));

  return entries.length > 0 ? `${entries.join(";")};` : fallback;
}

function isGroupCell(cell: MxCell, childParentIds: Set<string>): boolean {
  const style = cell.style ?? "";
  return (
    cell.vertex === "1" &&
    (style.includes("swimlane") ||
      style.includes("container=1") ||
      style.includes("collapsible=1") ||
      childParentIds.has(cell.id))
  );
}

function parseMxCells(xml: string): MxCell[] {
  const cells: MxCell[] = [];
  const cellPattern = /<mxCell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/g;
  let match: RegExpExecArray | null;

  while ((match = cellPattern.exec(xml)) !== null) {
    const attributes = parseAttributes(match[1]);

    if (!attributes.id) {
      continue;
    }

    const body = match[2] ?? "";
    const geometryMatch = body.match(/<mxGeometry\b([^>]*?)(?:\/>|>[\s\S]*?<\/mxGeometry>)/);
    const geometryAttributes = geometryMatch ? parseAttributes(geometryMatch[1]) : undefined;

    cells.push({
      id: attributes.id,
      value: attributes.value,
      style: attributes.style,
      parent: attributes.parent,
      source: attributes.source,
      target: attributes.target,
      vertex: attributes.vertex,
      edge: attributes.edge,
      geometry: geometryAttributes
        ? {
            x: numberFromAttribute(geometryAttributes.x),
            y: numberFromAttribute(geometryAttributes.y),
            width: numberFromAttribute(geometryAttributes.width),
            height: numberFromAttribute(geometryAttributes.height),
            relative: geometryAttributes.relative,
            as: geometryAttributes.as
          }
        : undefined,
      rawAttributes: attributes
    });
  }

  return cells;
}

function getDiagramName(xml: string): string | undefined {
  const match = xml.match(/<diagram\b([^>]*)>/);
  return match ? parseAttributes(match[1]).name : undefined;
}

export function validateDrawioXmlShape(xml: string): XmlValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const trimmed = xml.trim();

  if (!trimmed) {
    errors.push("XML content is empty.");
  }

  if (!trimmed.includes("<mxfile") && !trimmed.includes("<mxGraphModel")) {
    errors.push("XML does not look like Draw.io / diagrams.net XML.");
  }

  if (!trimmed.includes("<root") || !trimmed.includes("</root>")) {
    errors.push("XML is missing an mxGraphModel root element.");
  }

  const cells = parseMxCells(trimmed);

  if (!cells.some((cell) => cell.id === "0")) {
    warnings.push("Root cell id 0 is missing; repair can add it.");
  }

  if (!cells.some((cell) => cell.id === "1")) {
    warnings.push("Layer cell id 1 is missing; repair can add it.");
  }

  const ids = new Set(cells.map((cell) => cell.id));

  for (const cell of cells) {
    if (cell.edge === "1") {
      if (cell.source && !ids.has(cell.source)) {
        errors.push(`Edge ${cell.id} references missing source ${cell.source}.`);
      }

      if (cell.target && !ids.has(cell.target)) {
        errors.push(`Edge ${cell.id} references missing target ${cell.target}.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function repairDrawioXml(xml: string): { xml: string; repairApplied: boolean; notes: string[] } {
  const trimmed = xml.trim();
  const notes: string[] = [];

  if (!trimmed) {
    return {
      xml: createDrawioXmlFromModel(createEmptyDiagramModel()),
      repairApplied: true,
      notes: ["Created an empty Draw.io document because the XML was empty."]
    };
  }

  if (!trimmed.includes("<mxGraphModel")) {
    return {
      xml: createDrawioXmlFromModel(createEmptyDiagramModel(trimmed)),
      repairApplied: true,
      notes: ["Wrapped non-Draw.io XML content in an empty Draw.io document."]
    };
  }

  if (!trimmed.includes("<root") || !trimmed.includes("</root>")) {
    const repaired = trimmed.replace(/(<mxGraphModel\b[^>]*>)([\s\S]*?)(<\/mxGraphModel>)/, "$1<root>$2</root>$3");

    if (repaired !== trimmed) {
      notes.push("Inserted missing mxGraphModel root wrapper.");
      return {
        xml: repaired,
        repairApplied: true,
        notes
      };
    }

    return {
      xml: createDrawioXmlFromModel(createEmptyDiagramModel(trimmed)),
      repairApplied: true,
      notes: ["Replaced malformed Draw.io XML with an empty Draw.io document because mxGraphModel was incomplete."]
    };
  }

  const cells = parseMxCells(trimmed);
  const hasRoot = cells.some((cell) => cell.id === "0");
  const hasLayer = cells.some((cell) => cell.id === "1");

  if (hasRoot && hasLayer) {
    return { xml, repairApplied: false, notes };
  }

  const insert = `${hasRoot ? "" : '<mxCell id="0"/>'}${hasLayer ? "" : '<mxCell id="1" parent="0"/>'}`;
  const repaired = trimmed.replace("<root>", `<root>${insert}`);

  if (!hasRoot) {
    notes.push("Inserted missing root cell id 0.");
  }

  if (!hasLayer) {
    notes.push("Inserted missing default layer cell id 1.");
  }

  return { xml: repaired, repairApplied: true, notes };
}

export function parseDrawioXmlToDiagramModel(xml: string): DiagramModel {
  const validation = validateDrawioXmlShape(xml);

  if (!validation.valid) {
    throw new Error(`Invalid Draw.io XML: ${validation.errors.join(" ")}`);
  }

  const cells = parseMxCells(xml);
  const childParentIds = new Set(
    cells
      .filter((cell) => cell.parent && !ROOT_CELL_IDS.has(cell.parent))
      .map((cell) => cell.parent as string)
  );
  const groupIds = new Set(
    cells.filter((cell) => isGroupCell(cell, childParentIds)).map((cell) => cell.id)
  );

  const groups: DiagramGroupModel[] = cells
    .filter((cell) => groupIds.has(cell.id))
    .map((cell) => ({
      id: cell.id,
      stableId: cell.id,
      label: cell.value ?? "",
      nodeIds: cells
        .filter((candidate) => candidate.parent === cell.id && candidate.vertex === "1" && !groupIds.has(candidate.id))
        .map((candidate) => candidate.id),
      boundingBox: boundingBoxFromGeometry(cell.geometry),
      style: {
        ...styleToRecord(cell.style),
        __mxCellRawAttributes: cell.rawAttributes
      }
    }));

  const nodes: DiagramNodeModel[] = cells
    .filter((cell) => cell.vertex === "1" && !groupIds.has(cell.id) && !ROOT_CELL_IDS.has(cell.id))
    .map((cell) => ({
      id: cell.id,
      stableId: cell.id,
      label: cell.value ?? "",
      groupId: cell.parent && groupIds.has(cell.parent) ? cell.parent : undefined,
      boundingBox: boundingBoxFromGeometry(cell.geometry),
      style: styleToRecord(cell.style),
      data: {
        mxCell: {
          parent: cell.parent,
          rawAttributes: cell.rawAttributes
        }
      }
    }));

  const edges: DiagramEdgeModel[] = cells
    .filter((cell) => cell.edge === "1" && !ROOT_CELL_IDS.has(cell.id))
    .map((cell) => ({
      id: cell.id,
      stableId: cell.id,
      sourceId: cell.source ?? "",
      targetId: cell.target ?? "",
      label: cell.value,
      style: styleToRecord(cell.style),
      data: {
        mxCell: {
          parent: cell.parent,
          rawAttributes: cell.rawAttributes,
          geometry: cell.geometry
        }
      }
    }));

  return {
    nodes,
    edges,
    groups,
    layoutMetadata: {
      diagramName: getDiagramName(xml),
      importedAt: new Date().toISOString()
    },
    styleMetadata: {},
    sourceXml: xml,
    normalized: {
      format: "drawio",
      rootCellIds: cells.filter((cell) => ROOT_CELL_IDS.has(cell.id)).map((cell) => cell.id),
      warnings: validation.warnings
    }
  };
}

export function createEmptyDiagramModel(sourceXml?: string): DiagramModel {
  return {
    nodes: [],
    edges: [],
    groups: [],
    layoutMetadata: {},
    styleMetadata: {},
    sourceXml,
    normalized: {
      format: "drawio"
    }
  };
}

function serializeGeometry(geometry: BoundingBox | undefined, edge = false): string {
  if (edge) {
    return '<mxGeometry relative="1" as="geometry"/>';
  }

  const box = geometry ?? { x: 40, y: 40, width: 120, height: 60 };

  return `<mxGeometry ${serializeAttributes({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    as: "geometry"
  })}/>`;
}

function serializeGroup(group: DiagramGroupModel): string {
  const attributes = serializeAttributes(mergeMxCellAttributes(mxCellAttributesFromStyle(group.style), {
    id: group.id,
    value: group.label,
    style: styleFromRecord(group.style, DEFAULT_GROUP_STYLE),
    vertex: "1",
    parent: "1"
  }));

  return `<mxCell ${attributes}>${serializeGeometry(group.boundingBox)}</mxCell>`;
}

function serializeNode(node: DiagramNodeModel): string {
  const parent = node.groupId ?? "1";
  const attributes = serializeAttributes(mergeMxCellAttributes(mxCellAttributesFromData(node.data), {
    id: node.id,
    value: node.label,
    style: styleFromRecord(node.style, DEFAULT_NODE_STYLE),
    vertex: "1",
    parent
  }));

  return `<mxCell ${attributes}>${serializeGeometry(node.boundingBox)}</mxCell>`;
}

function serializeEdge(edge: DiagramEdgeModel): string {
  const attributes = serializeAttributes(mergeMxCellAttributes(mxCellAttributesFromData(edge.data), {
    id: edge.id,
    value: edge.label,
    style: styleFromRecord(edge.style, DEFAULT_EDGE_STYLE),
    edge: "1",
    parent: "1",
    source: edge.sourceId,
    target: edge.targetId
  }));

  return `<mxCell ${attributes}>${serializeGeometry(undefined, true)}</mxCell>`;
}

export function createDrawioXmlFromModel(model: DiagramModel): string {
  const diagramName =
    typeof model.layoutMetadata.diagramName === "string" ? model.layoutMetadata.diagramName : "Diagram";
  const cells = [
    '<mxCell id="0"/>',
    '<mxCell id="1" parent="0"/>',
    ...model.groups.map(serializeGroup),
    ...model.nodes.map(serializeNode),
    ...model.edges.map(serializeEdge)
  ];

  return [
    '<mxfile host="app.diagrams.net" agent="openai-native-editor" version="24.7.17">',
    `<diagram name="${encodeXml(diagramName)}">`,
    '<mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">',
    "<root>",
    ...cells,
    "</root>",
    "</mxGraphModel>",
    "</diagram>",
    "</mxfile>"
  ].join("");
}

export function validateAndRepairDrawioXml(xml: string): {
  xml: string;
  valid: boolean;
  repairApplied: boolean;
  errors: string[];
  warnings: string[];
  notes: string[];
} {
  const initial = validateDrawioXmlShape(xml);

  if (initial.valid && initial.warnings.length === 0) {
    return {
      xml,
      valid: true,
      repairApplied: false,
      errors: [],
      warnings: [],
      notes: []
    };
  }

  const repair = repairDrawioXml(xml);
  const after = validateDrawioXmlShape(repair.xml);

  return {
    xml: repair.xml,
    valid: after.valid,
    repairApplied: repair.repairApplied,
    errors: after.errors,
    warnings: after.warnings,
    notes: repair.notes
  };
}
