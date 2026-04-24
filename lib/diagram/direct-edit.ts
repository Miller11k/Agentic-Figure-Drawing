import type { BoundingBox, DiagramEdgeModel, DiagramGroupModel, DiagramModel, DiagramNodeModel, DirectDiagramEditOperation } from "@/types";
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
    type: operation.node.type,
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

function groupBoundingBoxForNodes(nodes: DiagramNodeModel[]): BoundingBox | undefined {
  const boxes = nodes.map((node) => node.boundingBox).filter((box): box is BoundingBox => Boolean(box));

  if (boxes.length === 0) return undefined;

  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));

  return {
    x: minX - 36,
    y: minY - 54,
    width: maxX - minX + 72,
    height: maxY - minY + 90
  };
}

function refreshGroupMembership(model: DiagramModel) {
  for (const group of model.groups) {
    group.nodeIds = model.nodes.filter((node) => node.groupId === group.id).map((node) => node.id);
    group.boundingBox = groupBoundingBoxForNodes(model.nodes.filter((node) => node.groupId === group.id));
  }
}

function applyAddGroup(model: DiagramModel, operation: Extract<DirectDiagramEditOperation, { type: "add-group" }>) {
  const existingIds = new Set(model.groups.map((group) => group.id));
  const id = operation.group.id ?? nextId("group", operation.group.label, existingIds);
  const nodeIds = operation.group.nodeIds ?? [];
  const group: DiagramGroupModel = {
    id,
    stableId: id,
    label: operation.group.label,
    nodeIds,
    boundingBox: groupBoundingBoxForNodes(model.nodes.filter((node) => nodeIds.includes(node.id))),
    style: operation.group.style ?? {
      raw: "swimlane;whiteSpace=wrap;html=1;collapsible=1;fillColor=#f8fafc;strokeColor=#94a3b8;"
    }
  };

  model.groups.push(group);
  for (const node of model.nodes) {
    if (nodeIds.includes(node.id)) {
      node.groupId = id;
    }
  }
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

    if (operation.type === "resize-node") {
      const node = model.nodes.find((candidate) => candidate.id === operation.nodeId);
      if (!node) {
        throw new Error(`Node ${operation.nodeId} was not found.`);
      }
      const currentBox = node.boundingBox ?? { x: 80, y: 80, width: 150, height: 70 };
      node.boundingBox = {
        x: operation.x ?? currentBox.x,
        y: operation.y ?? currentBox.y,
        width: Math.max(48, operation.width),
        height: Math.max(36, operation.height)
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

    if (operation.type === "update-node-fields") {
      const node = model.nodes.find((candidate) => candidate.id === operation.nodeId);
      if (!node) {
        throw new Error(`Node ${operation.nodeId} was not found.`);
      }
      if (operation.label?.trim()) {
        node.label = operation.label.trim();
      }
      if (operation.nodeType?.trim()) {
        node.type = operation.nodeType.trim();
      }
      if (operation.groupId !== undefined) {
        if (operation.groupId && !model.groups.some((group) => group.id === operation.groupId)) {
          throw new Error(`Group ${operation.groupId} was not found.`);
        }
        node.groupId = operation.groupId || undefined;
      }
      if (
        operation.x !== undefined ||
        operation.y !== undefined ||
        operation.width !== undefined ||
        operation.height !== undefined
      ) {
        const currentBox = node.boundingBox ?? { x: 80, y: 80, width: 150, height: 70 };
        node.boundingBox = {
          x: operation.x ?? currentBox.x,
          y: operation.y ?? currentBox.y,
          width: Math.max(48, operation.width ?? currentBox.width),
          height: Math.max(36, operation.height ?? currentBox.height)
        };
      }
      if (operation.style) {
        node.style = { ...node.style, ...operation.style };
      }
      if (operation.data) {
        node.data = { ...node.data, ...operation.data };
      }
    }

    if (operation.type === "add-edge") {
      applyAddEdge(model, operation);
    }

    if (operation.type === "delete-edge") {
      model.edges = model.edges.filter((edge) => edge.id !== operation.edgeId);
    }

    if (operation.type === "update-edge-style") {
      const edge = model.edges.find((candidate) => candidate.id === operation.edgeId);
      if (!edge) {
        throw new Error(`Edge ${operation.edgeId} was not found.`);
      }
      edge.style = { ...edge.style, ...operation.style };
    }

    if (operation.type === "update-edge-label") {
      const edge = model.edges.find((candidate) => candidate.id === operation.edgeId);
      if (!edge) {
        throw new Error(`Edge ${operation.edgeId} was not found.`);
      }
      edge.label = operation.label?.trim() ? operation.label.trim() : undefined;
    }

    if (operation.type === "update-edge-fields") {
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
      if (operation.label !== undefined) {
        edge.label = operation.label.trim() ? operation.label.trim() : undefined;
      }
      if (operation.style) {
        edge.style = { ...edge.style, ...operation.style };
      }
      if (operation.data) {
        edge.data = { ...edge.data, ...operation.data };
      }
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

    if (operation.type === "add-group") {
      applyAddGroup(model, operation);
    }

    if (operation.type === "update-group") {
      const group = model.groups.find((candidate) => candidate.id === operation.groupId);
      if (!group) {
        throw new Error(`Group ${operation.groupId} was not found.`);
      }
      if (operation.label) {
        group.label = operation.label;
      }
      if (operation.style) {
        group.style = { ...group.style, ...operation.style };
      }
    }

    if (operation.type === "delete-group") {
      const group = model.groups.find((candidate) => candidate.id === operation.groupId);
      if (!group) {
        throw new Error(`Group ${operation.groupId} was not found.`);
      }
      if (operation.ungroupNodes ?? true) {
        model.nodes = model.nodes.map((node) =>
          node.groupId === operation.groupId ? { ...node, groupId: undefined } : node
        );
      }
      model.groups = model.groups.filter((candidate) => candidate.id !== operation.groupId);
    }

    if (operation.type === "set-node-group") {
      const node = model.nodes.find((candidate) => candidate.id === operation.nodeId);
      if (!node) {
        throw new Error(`Node ${operation.nodeId} was not found.`);
      }
      if (operation.groupId && !model.groups.some((group) => group.id === operation.groupId)) {
        throw new Error(`Group ${operation.groupId} was not found.`);
      }
      node.groupId = operation.groupId;
    }
  }

  refreshGroupMembership(model);
  const output = model;

  output.normalized = {
    ...output.normalized,
    lastDirectEditOperationCount: operations.length
  };

  return output;
}
