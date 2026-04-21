import type { DiagramModel } from "@/types";

export interface XmlValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateDrawioXmlShape(xml: string): XmlValidationResult {
  const trimmed = xml.trim();

  if (!trimmed) {
    return { valid: false, errors: ["XML content is empty."] };
  }

  if (!trimmed.includes("<mxfile") && !trimmed.includes("<mxGraphModel")) {
    return { valid: false, errors: ["XML does not look like Draw.io / diagrams.net XML."] };
  }

  return { valid: true, errors: [] };
}

export function createEmptyDiagramModel(sourceXml?: string): DiagramModel {
  return {
    nodes: [],
    edges: [],
    groups: [],
    layoutMetadata: {},
    styleMetadata: {},
    sourceXml,
    normalized: {}
  };
}
