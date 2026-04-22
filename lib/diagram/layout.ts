import type { BoundingBox, DiagramEdgeModel, DiagramModel, DiagramNodeModel } from "@/types";

const DEFAULT_NODE_WIDTH = 150;
const DEFAULT_NODE_HEIGHT = 70;
const X_GAP = 140;
const Y_GAP = 110;
const START_X = 80;
const START_Y = 80;
const MIN_NODE_GAP = 64;
const MIN_GROUP_GAP = 72;

export type DiagramLayoutMode = "optimized" | "hierarchical" | "grid" | "radial";

function boxFor(node: DiagramNodeModel): BoundingBox {
  return node.boundingBox ?? {
    x: START_X,
    y: START_Y,
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT
  };
}

function readableBoxFor(node: DiagramNodeModel): BoundingBox {
  const current = boxFor(node);
  const labelLength = Math.max(node.label.length, 8);
  const type = String(node.type ?? node.style.shape ?? "");
  const lineCount = Math.max(1, Math.ceil(labelLength / 22));
  const isDecision = type.includes("decision") || type.includes("diamond") || type.includes("rhombus");
  const isImageLike = type.includes("image") || type.includes("icon");
  const isTerminator = type.includes("start") || type.includes("end") || type.includes("terminator");
  const targetWidth = Math.min(280, Math.max(DEFAULT_NODE_WIDTH, 112 + Math.min(labelLength, 28) * 6));
  const targetHeight = Math.min(150, Math.max(DEFAULT_NODE_HEIGHT, 52 + lineCount * 18));
  const width = Math.max(current.width || DEFAULT_NODE_WIDTH, isImageLike ? 190 : isDecision ? 126 : isTerminator ? 140 : targetWidth);
  const height = Math.max(current.height || DEFAULT_NODE_HEIGHT, isImageLike ? 110 : isDecision ? 106 : isTerminator ? 64 : targetHeight);

  return {
    ...current,
    width: Math.round(width),
    height: Math.round(height)
  };
}

function boxesOverlap(a: BoundingBox, b: BoundingBox, padding = 0) {
  return !(
    a.x + a.width + padding <= b.x ||
    b.x + b.width + padding <= a.x ||
    a.y + a.height + padding <= b.y ||
    b.y + b.height + padding <= a.y
  );
}

function shiftNodes(model: DiagramModel, nodeIds: Set<string>, dx: number, dy: number) {
  for (const node of model.nodes) {
    if (!nodeIds.has(node.id) || !node.boundingBox) continue;
    node.boundingBox = {
      ...node.boundingBox,
      x: Math.round(node.boundingBox.x + dx),
      y: Math.round(node.boundingBox.y + dy)
    };
  }
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
      x: minX - 44,
      y: minY - 78,
      width: maxX - minX + 88,
      height: maxY - minY + 132
    };
  }
}

function resolveGroupOverlaps(model: DiagramModel) {
  if (model.groups.length < 2) return;

  for (let pass = 0; pass < 4; pass += 1) {
    let shifted = false;
    updateGroupBounds(model);
    const groups = [...model.groups].sort((a, b) => {
      const ay = a.boundingBox?.y ?? 0;
      const by = b.boundingBox?.y ?? 0;
      return ay - by || a.id.localeCompare(b.id);
    });

    for (let i = 0; i < groups.length; i += 1) {
      const first = groups[i];
      const firstBox = first.boundingBox;
      if (!firstBox) continue;

      for (let j = i + 1; j < groups.length; j += 1) {
        const second = groups[j];
        const secondBox = second.boundingBox;
        if (!secondBox) continue;
        const firstMembers = new Set(first.nodeIds);
        const sharesMembers = second.nodeIds.some((nodeId) => firstMembers.has(nodeId));

        if (sharesMembers || !boxesOverlap(firstBox, secondBox, MIN_GROUP_GAP)) continue;

        const dy = firstBox.y + firstBox.height + MIN_GROUP_GAP - secondBox.y;
        shiftNodes(model, new Set(second.nodeIds), 0, dy);
        shifted = true;
      }
    }

    if (!shifted) break;
  }

  updateGroupBounds(model);
}

function normalizeLayoutOrigin(model: DiagramModel, padding = START_X) {
  const boxes = model.nodes.map((node) => node.boundingBox).filter((box): box is BoundingBox => Boolean(box));
  if (boxes.length === 0) return;

  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const dx = padding - minX;
  const dy = padding - minY;

  for (const node of model.nodes) {
    if (node.boundingBox) {
      node.boundingBox = {
        ...node.boundingBox,
        x: Math.round(node.boundingBox.x + dx),
        y: Math.round(node.boundingBox.y + dy)
      };
    }
  }
}

function edgeDegree(model: DiagramModel) {
  const degree = new Map(model.nodes.map((node) => [node.id, 0]));
  for (const edge of model.edges) {
    degree.set(edge.sourceId, (degree.get(edge.sourceId) ?? 0) + 1);
    degree.set(edge.targetId, (degree.get(edge.targetId) ?? 0) + 1);
  }
  return degree;
}

export function applyGridLayout(diagramModel: DiagramModel): DiagramModel {
  const model = cloneModel(diagramModel);
  const columns = Math.max(1, Math.ceil(Math.sqrt(model.nodes.length)));

  model.nodes
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
    .forEach((node, index) => {
      const current = readableBoxFor(node);
      const column = index % columns;
      const row = Math.floor(index / columns);
      node.boundingBox = {
        x: START_X + column * (current.width + X_GAP + MIN_NODE_GAP),
        y: START_Y + row * (current.height + Y_GAP + MIN_NODE_GAP),
        width: current.width,
        height: current.height
      };
    });

  updateGroupBounds(model);
  resolveGroupOverlaps(model);
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
      const current = readableBoxFor(node);
      const angle = model.nodes.length <= 1 ? 0 : (index / model.nodes.length) * Math.PI * 2 - Math.PI / 2;
      node.boundingBox = {
        x: Math.round(center.x + Math.cos(angle) * radius - current.width / 2),
        y: Math.round(center.y + Math.sin(angle) * radius - current.height / 2),
        width: current.width,
        height: current.height
      };
    });

  updateGroupBounds(model);
  resolveGroupOverlaps(model);
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
        const current = readableBoxFor(node);
        node.boundingBox = {
          x: START_X + depth * (DEFAULT_NODE_WIDTH + X_GAP + MIN_NODE_GAP),
          y: START_Y + index * (current.height + Y_GAP + MIN_NODE_GAP),
          width: current.width,
          height: current.height
        };
      });
  }

  updateGroupBounds(model);
  resolveGroupOverlaps(model);
  model.layoutMetadata = {
    ...model.layoutMetadata,
    layout: "deterministic-hierarchical",
    layoutUpdatedAt: new Date(0).toISOString(),
    nodeWidth: DEFAULT_NODE_WIDTH,
    nodeHeight: DEFAULT_NODE_HEIGHT
  };

  return model;
}

export function applyOptimizedLayout(diagramModel: DiagramModel): DiagramModel {
  const model = cloneModel(diagramModel);

  if (model.nodes.length <= 1) {
    return applyGridLayout(model);
  }

  const depths = computeDepths(model.nodes, model.edges);
  const maxDepth = Math.max(0, ...Array.from(depths.values()));
  const connectedNodeIds = new Set(model.edges.flatMap((edge) => [edge.sourceId, edge.targetId]));
  const degree = edgeDegree(model);
  const hasMeaningfulFlow = model.edges.length > 0 && maxDepth > 0;
  const hasGroups = model.groups.some((group) => group.nodeIds.length > 0);
  const isDense = model.edges.length > Math.max(3, model.nodes.length * 1.35);

  if (!hasMeaningfulFlow || isDense) {
    const radial = applyRadialLayout(model);
    radial.layoutMetadata = {
      ...radial.layoutMetadata,
      layout: "deterministic-optimized-radial",
      layoutReason: isDense ? "dense graph" : "no directed flow"
    };
    return radial;
  }

  const columns = new Map<number, DiagramNodeModel[]>();
  for (const node of model.nodes) {
    const depth = connectedNodeIds.has(node.id) ? depths.get(node.id) ?? 0 : maxDepth + 1;
    const bucket = columns.get(depth) ?? [];
    bucket.push(node);
    columns.set(depth, bucket);
  }

  const sortedDepths = Array.from(columns.keys()).sort((a, b) => a - b);
  const maxRows = Math.max(...Array.from(columns.values()).map((nodes) => nodes.length));
  const maxNodeWidth = Math.max(DEFAULT_NODE_WIDTH, ...model.nodes.map((node) => readableBoxFor(node).width));
  const columnGap = Math.max(X_GAP + 130, model.nodes.length > 8 ? X_GAP + 180 : X_GAP + 120);
  const rowGap = Math.max(Y_GAP + 70, maxRows > 4 ? Y_GAP + 95 : Y_GAP + 70);
  const sortedColumns = new Map<number, DiagramNodeModel[]>();
  const columnHeights = new Map<number, number>();
  const maxColumnHeight = Math.max(
    ...sortedDepths.map((depth) => {
      const nodes = [...(columns.get(depth) ?? [])].sort((a, b) => {
        const groupCompare = (a.groupId ?? "").localeCompare(b.groupId ?? "");
        if (hasGroups && groupCompare !== 0) return groupCompare;
        return (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
      });
      sortedColumns.set(depth, nodes);
      const height = nodes.reduce((sum, node) => sum + readableBoxFor(node).height, 0) + Math.max(0, nodes.length - 1) * rowGap;
      columnHeights.set(depth, height);
      return height;
    })
  );

  for (const depth of sortedDepths) {
    const nodes = sortedColumns.get(depth) ?? [];
    let y = START_Y + (maxColumnHeight - (columnHeights.get(depth) ?? 0)) / 2;
    for (const node of nodes) {
      const current = readableBoxFor(node);
      node.boundingBox = {
        x: START_X + depth * (maxNodeWidth + columnGap),
        y: Math.round(y),
        width: current.width,
        height: current.height
      };
      y += current.height + rowGap;
    }
  }

  normalizeLayoutOrigin(model);
  updateGroupBounds(model);
  resolveGroupOverlaps(model);
  model.layoutMetadata = {
    ...model.layoutMetadata,
    layout: "deterministic-optimized",
    layoutUpdatedAt: new Date(0).toISOString(),
    layoutReason: hasGroups ? "directed flow with grouped regions" : "directed flow",
    nodeWidth: DEFAULT_NODE_WIDTH,
    nodeHeight: DEFAULT_NODE_HEIGHT,
    columnGap,
    rowGap,
    overlapAvoidance: true,
    labelReadability: "node-size-and-region-aware"
  };

  return model;
}

export function applyDiagramLayout(diagramModel: DiagramModel, mode: DiagramLayoutMode): DiagramModel {
  if (mode === "optimized") return applyOptimizedLayout(diagramModel);
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
