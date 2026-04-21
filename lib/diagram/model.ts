import type {
  BoundingBox,
  DiagramEdgeModel,
  DiagramGroupModel,
  DiagramModel,
  DiagramNodeModel,
  DiagramSpec
} from "@/types";

const NODE_WIDTH = 150;
const NODE_HEIGHT = 70;
const X_GAP = 90;
const Y_GAP = 90;
const START_X = 80;
const START_Y = 80;

export function stableDiagramId(prefix: string, labelOrId: string, index: number): string {
  const slug = labelOrId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

  return `${prefix}_${slug || index + 1}`;
}

export function layoutNodes(count: number): BoundingBox[] {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));

  return Array.from({ length: count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);

    return {
      x: START_X + column * (NODE_WIDTH + X_GAP),
      y: START_Y + row * (NODE_HEIGHT + Y_GAP),
      width: NODE_WIDTH,
      height: NODE_HEIGHT
    };
  });
}

function inferNodeType(label: string, explicitType?: string): string | undefined {
  if (explicitType) {
    return explicitType;
  }

  const normalized = label.toLowerCase();

  if (normalized.includes("database") || normalized.includes("db") || normalized.includes("store")) {
    return "database";
  }

  if (normalized.includes("gateway") || normalized.includes("router")) {
    return "gateway";
  }

  if (normalized.includes("service") || normalized.includes("api")) {
    return "service";
  }

  return undefined;
}

function defaultNodeStyle(type?: string): Record<string, unknown> {
  if (type === "database") {
    return {
      raw: "shape=cylinder3d;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;"
    };
  }

  if (type === "gateway") {
    return {
      raw: "rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;"
    };
  }

  return {
    raw: "rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;"
  };
}

function groupBoundingBox(nodeBoxes: BoundingBox[]): BoundingBox {
  if (nodeBoxes.length === 0) {
    return { x: 40, y: 40, width: 240, height: 160 };
  }

  const minX = Math.min(...nodeBoxes.map((box) => box.x));
  const minY = Math.min(...nodeBoxes.map((box) => box.y));
  const maxX = Math.max(...nodeBoxes.map((box) => box.x + box.width));
  const maxY = Math.max(...nodeBoxes.map((box) => box.y + box.height));

  return {
    x: minX - 30,
    y: minY - 50,
    width: maxX - minX + 60,
    height: maxY - minY + 80
  };
}

export function createDiagramModelFromSpec(spec: DiagramSpec): DiagramModel {
  const nodeBoxes = layoutNodes(spec.nodes.length);

  const nodes: DiagramNodeModel[] = spec.nodes.map((node, index) => {
    const id = node.id ?? stableDiagramId("node", node.label, index);
    const type = inferNodeType(node.label, node.type);

    return {
      id,
      stableId: id,
      label: node.label,
      type,
      groupId: node.groupId,
      boundingBox: nodeBoxes[index],
      style: {
        ...defaultNodeStyle(type),
        ...(node.attributes ?? {})
      },
      data: {
        source: "diagram-spec"
      }
    };
  });

  const idByOriginalSelector = new Map<string, string>();
  spec.nodes.forEach((node, index) => {
    const resolvedId = nodes[index].id;
    if (node.id) {
      idByOriginalSelector.set(node.id, resolvedId);
    }
    idByOriginalSelector.set(node.label, resolvedId);
  });

  const edges: DiagramEdgeModel[] = spec.edges.map((edge, index) => {
    const id = edge.id ?? stableDiagramId("edge", `${edge.sourceId}_${edge.targetId}`, index);

    return {
      id,
      stableId: id,
      sourceId: idByOriginalSelector.get(edge.sourceId) ?? edge.sourceId,
      targetId: idByOriginalSelector.get(edge.targetId) ?? edge.targetId,
      label: edge.label,
      style: {
        raw: "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;",
        ...(edge.attributes ?? {})
      },
      data: {
        source: "diagram-spec"
      }
    };
  });

  const groups: DiagramGroupModel[] = spec.groups.map((group, index) => {
    const id = group.id ?? stableDiagramId("group", group.label, index);
    const nodeIds = group.nodeIds.map((nodeId) => idByOriginalSelector.get(nodeId) ?? nodeId);
    const memberBoxes = nodes
      .filter((node) => nodeIds.includes(node.id))
      .map((node) => node.boundingBox)
      .filter((box): box is BoundingBox => Boolean(box));

    for (const node of nodes) {
      if (nodeIds.includes(node.id)) {
        node.groupId = id;
      }
    }

    return {
      id,
      stableId: id,
      label: group.label,
      nodeIds,
      boundingBox: groupBoundingBox(memberBoxes),
      style: {
        raw: "swimlane;whiteSpace=wrap;html=1;collapsible=1;",
        ...(group.attributes ?? {})
      }
    };
  });

  return {
    nodes,
    edges,
    groups,
    layoutMetadata: {
      ...spec.layoutHints,
      diagramName: spec.title,
      layout: "deterministic-grid",
      nodeWidth: NODE_WIDTH,
      nodeHeight: NODE_HEIGHT
    },
    styleMetadata: spec.styleHints,
    normalized: {
      title: spec.title,
      diagramType: spec.diagramType,
      source: "diagram-spec"
    }
  };
}
