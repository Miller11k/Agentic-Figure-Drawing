import type { BoundingBox, DiagramEdgeModel, DiagramModel, DiagramNodeModel } from "@/types";

const DEFAULT_NODE_WIDTH = 150;
const DEFAULT_NODE_HEIGHT = 70;
const X_GAP = 140;
const Y_GAP = 110;
const START_X = 80;
const START_Y = 80;

export type DiagramLayoutMode = "hierarchical" | "grid" | "radial";

function boxFor(node: DiagramNodeModel): BoundingBox {
  return node.boundingBox ?? {
    x: START_X,
    y: START_Y,
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT
  };
}

function cloneModel(model: DiagramModel): DiagramModel {
  return {
    ...model,
    nodes: model.nodes.map((node) => ({
      ...node,
      boundingBox: node.boundingBox ? { ...node.boundingBox } : undefined,
      style: { ...node.style },
      data: { ...node.data }
    })),
    edges: model.edges.map((edge) => ({ ...edge, style: { ...edge.style }, data: { ...edge.data } })),
    groups: model.groups.map((group) => ({
      ...group,
      nodeIds: [...group.nodeIds],
      boundingBox: group.boundingBox ? { ...group.boundingBox } : undefined,
      style: { ...group.style }
    })),
    layoutMetadata: { ...model.layoutMetadata },
    styleMetadata: { ...model.styleMetadata },
    normalized: { ...model.normalized }
  };
}

function computeDepths(nodes: DiagramNodeModel[], edges: DiagramEdgeModel[]) {
  const ids = new Set(nodes.map((node) => node.id));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of edges) {
    if (!ids.has(edge.sourceId) || !ids.has(edge.targetId)) continue;
    incoming.set(edge.targetId, (incoming.get(edge.targetId) ?? 0) + 1);
    outgoing.get(edge.sourceId)?.push(edge.targetId);
  }

  const queue = nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0).map((node) => node.id);
  const depths = new Map(nodes.map((node) => [node.id, 0]));

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depths.get(current) ?? 0;

    for (const target of outgoing.get(current) ?? []) {
      depths.set(target, Math.max(depths.get(target) ?? 0, currentDepth + 1));
      incoming.set(target, (incoming.get(target) ?? 1) - 1);
      if ((incoming.get(target) ?? 0) === 0) {
        queue.push(target);
      }
    }
  }

  return depths;
}

function updateGroupBounds(model: DiagramModel) {
  for (const group of model.groups) {
    const boxes = model.nodes
      .filter((node) => group.nodeIds.includes(node.id))
      .map((node) => node.boundingBox)
      .filter((box): box is BoundingBox => Boolean(box));

    if (boxes.length === 0) continue;

    const minX = Math.min(...boxes.map((box) => box.x));
    const minY = Math.min(...boxes.map((box) => box.y));
    const maxX = Math.max(...boxes.map((box) => box.x + box.width));
    const maxY = Math.max(...boxes.map((box) => box.y + box.height));

    group.boundingBox = {
      x: minX - 36,
      y: minY - 54,
      width: maxX - minX + 72,
      height: maxY - minY + 90
    };
  }
}

export function applyGridLayout(diagramModel: DiagramModel): DiagramModel {
  const model = cloneModel(diagramModel);
  const columns = Math.max(1, Math.ceil(Math.sqrt(model.nodes.length)));

  model.nodes
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
    .forEach((node, index) => {
      const current = boxFor(node);
      const column = index % columns;
      const row = Math.floor(index / columns);
      node.boundingBox = {
        x: START_X + column * (DEFAULT_NODE_WIDTH + X_GAP),
        y: START_Y + row * (DEFAULT_NODE_HEIGHT + Y_GAP),
        width: current.width || DEFAULT_NODE_WIDTH,
        height: current.height || DEFAULT_NODE_HEIGHT
      };
    });

  updateGroupBounds(model);
  model.layoutMetadata = {
    ...model.layoutMetadata,
    layout: "deterministic-grid",
    layoutUpdatedAt: new Date(0).toISOString(),
    nodeWidth: DEFAULT_NODE_WIDTH,
    nodeHeight: DEFAULT_NODE_HEIGHT
  };

  return model;
}

export function applyRadialLayout(diagramModel: DiagramModel): DiagramModel {
  const model = cloneModel(diagramModel);
  const radius = Math.max(220, model.nodes.length * 34);
  const center = { x: START_X + radius, y: START_Y + radius };

  model.nodes
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
    .forEach((node, index) => {
      const current = boxFor(node);
      const angle = model.nodes.length <= 1 ? 0 : (index / model.nodes.length) * Math.PI * 2 - Math.PI / 2;
      node.boundingBox = {
        x: Math.round(center.x + Math.cos(angle) * radius - current.width / 2),
        y: Math.round(center.y + Math.sin(angle) * radius - current.height / 2),
        width: current.width || DEFAULT_NODE_WIDTH,
        height: current.height || DEFAULT_NODE_HEIGHT
      };
    });

  updateGroupBounds(model);
  model.layoutMetadata = {
    ...model.layoutMetadata,
    layout: "deterministic-radial",
    layoutUpdatedAt: new Date(0).toISOString(),
    radius
  };

  return model;
}

export function applyHierarchicalLayout(diagramModel: DiagramModel): DiagramModel {
  const model = cloneModel(diagramModel);
  const depths = computeDepths(model.nodes, model.edges);
  const columns = new Map<number, DiagramNodeModel[]>();

  for (const node of model.nodes) {
    const depth = depths.get(node.id) ?? 0;
    const siblings = columns.get(depth) ?? [];
    siblings.push(node);
    columns.set(depth, siblings);
  }

  for (const [depth, nodes] of columns.entries()) {
    nodes
      .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
      .forEach((node, index) => {
        const current = boxFor(node);
        node.boundingBox = {
          x: START_X + depth * (DEFAULT_NODE_WIDTH + X_GAP),
          y: START_Y + index * (DEFAULT_NODE_HEIGHT + Y_GAP),
          width: current.width || DEFAULT_NODE_WIDTH,
          height: current.height || DEFAULT_NODE_HEIGHT
        };
      });
  }

  updateGroupBounds(model);
  model.layoutMetadata = {
    ...model.layoutMetadata,
    layout: "deterministic-hierarchical",
    layoutUpdatedAt: new Date(0).toISOString(),
    nodeWidth: DEFAULT_NODE_WIDTH,
    nodeHeight: DEFAULT_NODE_HEIGHT
  };

  return model;
}

export function applyDiagramLayout(diagramModel: DiagramModel, mode: DiagramLayoutMode): DiagramModel {
  if (mode === "grid") return applyGridLayout(diagramModel);
  if (mode === "radial") return applyRadialLayout(diagramModel);
  return applyHierarchicalLayout(diagramModel);
}

export interface RoutedEdge {
  points: Array<{ x: number; y: number }>;
  labelPoint: { x: number; y: number };
}

export function routeOrthogonalEdge(source: BoundingBox, target: BoundingBox): RoutedEdge {
  if (
    source.x === target.x &&
    source.y === target.y &&
    source.width === target.width &&
    source.height === target.height
  ) {
    const x = source.x + source.width;
    const y = source.y + source.height / 2;
    return {
      points: [
        { x, y },
        { x: x + 44, y: y - 44 },
        { x: x + 44, y: y + 44 },
        { x, y: y + 20 }
      ],
      labelPoint: { x: x + 50, y }
    };
  }

  const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const sourceOnLeft = sourceCenter.x <= targetCenter.x;
  const x1 = sourceOnLeft ? source.x + source.width : source.x;
  const x2 = sourceOnLeft ? target.x : target.x + target.width;
  const y1 = sourceCenter.y;
  const y2 = targetCenter.y;
  const midX = x1 + (x2 - x1) / 2;

  return {
    points: [
      { x: x1, y: y1 },
      { x: midX, y: y1 },
      { x: midX, y: y2 },
      { x: x2, y: y2 }
    ],
    labelPoint: {
      x: midX + 6,
      y: y1 + (y2 - y1) / 2 - 6
    }
  };
}

export function pointsToSvgPath(points: Array<{ x: number; y: number }>): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}
