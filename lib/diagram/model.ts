import type { DiagramModel, DiagramSpec } from "@/types";

export function createDiagramModelFromSpec(spec: DiagramSpec): DiagramModel {
  return {
    nodes: spec.nodes.map((node, index) => ({
      id: node.id ?? `node_${index + 1}`,
      stableId: node.id ?? `node_${index + 1}`,
      label: node.label,
      type: node.type,
      groupId: node.groupId,
      style: node.attributes ?? {},
      data: {}
    })),
    edges: spec.edges.map((edge, index) => ({
      id: edge.id ?? `edge_${index + 1}`,
      stableId: edge.id ?? `edge_${index + 1}`,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      label: edge.label,
      style: edge.attributes ?? {},
      data: {}
    })),
    groups: spec.groups.map((group, index) => ({
      id: group.id ?? `group_${index + 1}`,
      stableId: group.id ?? `group_${index + 1}`,
      label: group.label,
      nodeIds: group.nodeIds,
      style: group.attributes ?? {}
    })),
    layoutMetadata: spec.layoutHints,
    styleMetadata: spec.styleHints,
    normalized: {
      title: spec.title,
      diagramType: spec.diagramType
    }
  };
}
