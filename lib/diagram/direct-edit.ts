import type { DiagramEdgeModel, DiagramModel, DiagramNodeModel, DirectDiagramEditOperation } from "@/types";
import { stableDiagramId } from "./model";

function cloneModel(model: DiagramModel): DiagramModel {
  return {
    ...model,
    nodes: model.nodes.map((node) => ({ ...node, style: { ...node.style }, data: { ...node.data } })),
    edges: model.edges.map((edge) => ({ ...edge, style: { ...edge.style }, data: { ...edge.data } })),
    groups: model.groups.map((group) => ({
      ...group,
      nodeIds: [...group.nodeIds],
      style: { ...group.style }
    })),
    layoutMetadata: { ...model.layoutMetadata },
    styleMetadata: { ...model.styleMetadata },
    normalized: { ...model.normalized }
  };
}

function nextId(prefix: string, label: string, existingIds: Set<string>): string {
  let index = existingIds.size;
  let id = stableDiagramId(prefix, label, index);

  while (existingIds.has(id)) {
    index += 1;
    id = stableDiagramId(prefix, label, index);
  }

  return id;
}

function applyAddNode(model: DiagramModel, operation: Extract<DirectDiagramEditOperation, { type: "add-node" }>) {
  const existingIds = new Set(model.nodes.map((node) => node.id));
  const id = operation.node.id ?? nextId("node", operation.node.label, existingIds);
  const node: DiagramNodeModel = {
    id,
    stableId: id,
    label: operation.node.label,
    groupId: operation.node.groupId,
    boundingBox: {
      x: operation.node.x ?? 80 + model.nodes.length * 40,
      y: operation.node.y ?? 80 + model.nodes.length * 40,
      width: operation.node.width ?? 150,
      height: operation.node.height ?? 70
    },
    style: operation.node.style ?? {
      raw: "rounded=1;whiteSpace=wrap;html=1;"
    },
    data: {
      source: "direct-edit"
    }
  };

  model.nodes.push(node);

  if (node.groupId) {
    const group = model.groups.find((candidate) => candidate.id === node.groupId);
    if (group && !group.nodeIds.includes(node.id)) {
      group.nodeIds.push(node.id);
    }
  }
}

function applyAddEdge(model: DiagramModel, operation: Extract<DirectDiagramEditOperation, { type: "add-edge" }>) {
  const nodeIds = new Set(model.nodes.map((node) => node.id));
  if (!nodeIds.has(operation.edge.sourceId) || !nodeIds.has(operation.edge.targetId)) {
    throw new Error("Cannot add edge because source or target node does not exist.");
  }

  const existingIds = new Set(model.edges.map((edge) => edge.id));
  const id = operation.edge.id ?? nextId("edge", `${operation.edge.sourceId}_${operation.edge.targetId}`, existingIds);
  const edge: DiagramEdgeModel = {
    id,
    stableId: id,
    sourceId: operation.edge.sourceId,
    targetId: operation.edge.targetId,
    label: operation.edge.label,
    style: operation.edge.style ?? {
      raw: "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;"
    },
    data: {
      source: "direct-edit"
    }
  };

  model.edges.push(edge);
}

export function applyDirectDiagramEdits(
  diagramModel: DiagramModel,
  operations: DirectDiagramEditOperation[]
): DiagramModel {
  const model = cloneModel(diagramModel);

  for (const operation of operations) {
    if (operation.type === "rename-node") {
      const node = model.nodes.find((candidate) => candidate.id === operation.nodeId);
      if (!node) {
        throw new Error(`Node ${operation.nodeId} was not found.`);
      }
      node.label = operation.label;
    }

    if (operation.type === "move-node") {
      const node = model.nodes.find((candidate) => candidate.id === operation.nodeId);
      if (!node) {
        throw new Error(`Node ${operation.nodeId} was not found.`);
      }
      node.boundingBox = {
        x: operation.x,
        y: operation.y,
        width: node.boundingBox?.width ?? 150,
        height: node.boundingBox?.height ?? 70
      };
    }

    if (operation.type === "add-node") {
      applyAddNode(model, operation);
    }

    if (operation.type === "delete-node") {
      model.nodes = model.nodes.filter((node) => node.id !== operation.nodeId);
      model.edges = model.edges.filter(
        (edge) => edge.sourceId !== operation.nodeId && edge.targetId !== operation.nodeId
      );
      model.groups = model.groups.map((group) => ({
        ...group,
        nodeIds: group.nodeIds.filter((nodeId) => nodeId !== operation.nodeId)
      }));
    }

    if (operation.type === "update-node-style") {
      const node = model.nodes.find((candidate) => candidate.id === operation.nodeId);
      if (!node) {
        throw new Error(`Node ${operation.nodeId} was not found.`);
      }
      node.style = { ...node.style, ...operation.style };
    }

    if (operation.type === "add-edge") {
      applyAddEdge(model, operation);
    }

    if (operation.type === "delete-edge") {
      model.edges = model.edges.filter((edge) => edge.id !== operation.edgeId);
    }

    if (operation.type === "reconnect-edge") {
      const edge = model.edges.find((candidate) => candidate.id === operation.edgeId);
      const nodeIds = new Set(model.nodes.map((node) => node.id));

      if (!edge) {
        throw new Error(`Edge ${operation.edgeId} was not found.`);
      }

      if (operation.sourceId) {
        if (!nodeIds.has(operation.sourceId)) {
          throw new Error(`Source node ${operation.sourceId} was not found.`);
        }
        edge.sourceId = operation.sourceId;
      }

      if (operation.targetId) {
        if (!nodeIds.has(operation.targetId)) {
          throw new Error(`Target node ${operation.targetId} was not found.`);
        }
        edge.targetId = operation.targetId;
      }
    }
  }

  model.normalized = {
    ...model.normalized,
    lastDirectEditOperationCount: operations.length
  };

  return model;
}
