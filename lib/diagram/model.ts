import type {
  BoundingBox,
  DiagramEdgeModel,
  DiagramGroupModel,
  DiagramModel,
  DiagramNodeModel,
  DiagramSpec
} from "@/types";
import { applyDiagramLayout } from "./layout";
import { findSupportedDiagramIcon } from "./icon-catalog";

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
  if (/\b(start|begin|entry|trigger)\b/.test(normalized)) {
    return "start";
  }

  if (/\b(end|stop|finish|done|terminal|terminate)\b/.test(normalized)) {
    return "end";
  }

  if (/\b(input|request|upload|ingest|source)\b/.test(normalized)) {
    return "input";
  }

  if (/\b(output|response|result|download|export|sink)\b/.test(normalized)) {
    return "output";
  }

  if (normalized.includes("database") || normalized.includes("db") || normalized.includes("store")) {
    return "database";
  }

  if (normalized.includes("table") || normalized.includes("entity") || normalized.includes("primary key") || normalized.includes("foreign key")) {
    return "table";
  }

  if (normalized.includes("class") || normalized.includes("interface") || normalized.includes("package")) {
    return normalized.includes("package") ? "package" : "class";
  }

  if (normalized.includes("lifeline") || normalized.includes("activation") || normalized.includes("participant")) {
    return "lifeline";
  }

  if (normalized.includes("state") || normalized.includes("transition")) {
    return "state";
  }

  if (normalized.includes("milestone")) {
    return "milestone";
  }

  if (normalized.includes("task") || normalized.includes("gantt")) {
    return "task";
  }

  if (normalized.includes("queue") || normalized.includes("topic") || normalized.includes("stream")) {
    return normalized.includes("topic") ? "topic" : "queue";
  }

  if (normalized.includes("cache") || normalized.includes("redis")) {
    return "cache";
  }

  if (normalized.includes("bucket") || normalized.includes("object storage") || normalized.includes("blob")) {
    return "storage";
  }

  if (normalized.includes("server") || normalized.includes("host") || normalized.includes("compute") || normalized.includes("instance")) {
    return "server";
  }

  if (normalized.includes("router")) {
    return "router";
  }

  if (normalized.includes("switch")) {
    return "switch";
  }

  if (normalized.includes("firewall") || normalized.includes("waf")) {
    return "firewall";
  }

  if (normalized.includes("load balancer") || normalized.includes("alb") || normalized.includes("nlb")) {
    return "load-balancer";
  }

  if (normalized.includes("subnet") || normalized.includes("vpc") || normalized.includes("trust boundary")) {
    return "region";
  }

  if (normalized.includes("screen") || normalized.includes("form") || normalized.includes("button") || normalized.includes("wireframe")) {
    return "ui-component";
  }

  if (normalized.includes("cloud")) {
    return "cloud";
  }

  if (normalized.includes("user") || normalized.includes("client") || normalized.includes("actor")) {
    return "user";
  }

  if (normalized.includes("decision") || normalized.includes("if ") || normalized.includes("choice")) {
    return "decision";
  }

  if (normalized.includes("function") || normalized.includes("lambda") || normalized.includes("worker")) {
    return "function";
  }

  if (normalized.includes("document") || normalized.includes("file") || normalized.includes("report")) {
    return "document";
  }

  if (normalized.includes("gateway")) {
    return "gateway";
  }

  if (normalized.includes("service") || normalized.includes("api")) {
    return "service";
  }

  return findSupportedDiagramIcon(normalized)?.id;
}

function defaultNodeStyle(type?: string): Record<string, unknown> {
  if (type === "start" || type === "end" || type === "terminator") {
    const isEnd = type === "end";
    return {
      raw: `ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=${isEnd ? "#fee2e2" : "#dcfce7"};strokeColor=${isEnd ? "#dc2626" : "#16a34a"};`,
      shape: "ellipse",
      icon: isEnd ? "END" : "START"
    };
  }

  if (type === "input" || type === "output") {
    const isOutput = type === "output";
    return {
      raw: `shape=parallelogram;whiteSpace=wrap;html=1;fixedSize=1;fillColor=${isOutput ? "#eef2ff" : "#eff6ff"};strokeColor=${isOutput ? "#4f46e5" : "#2563eb"};`,
      shape: "parallelogram",
      icon: isOutput ? "OUT" : "IN"
    };
  }

  const catalogIcon = findSupportedDiagramIcon(type);

  if (catalogIcon) {
    return {
      raw: catalogIcon.drawioStyle,
      shape: catalogIcon.shape,
      icon: catalogIcon.icon,
      supportedIconId: catalogIcon.id
    };
  }

  if (type === "image" || type === "icon") {
    return {
      raw: "shape=image;whiteSpace=wrap;html=1;imageAspect=1;aspect=fixed;fillColor=#ffffff;strokeColor=#94a3b8;",
      shape: "image",
      icon: type === "icon" ? "Icon" : "Img"
    };
  }

  if (type === "class" || type === "interface") {
    return {
      raw: "swimlane;whiteSpace=wrap;html=1;startSize=28;horizontal=1;fillColor=#f8fafc;strokeColor=#475569;",
      shape: "class",
      icon: type === "interface" ? "IF" : "Class"
    };
  }

  if (type === "table" || type === "entity") {
    return {
      raw: "shape=table;startSize=28;container=1;collapsible=0;childLayout=tableLayout;whiteSpace=wrap;html=1;fillColor=#ecfeff;strokeColor=#0891b2;",
      shape: "table",
      icon: "Table"
    };
  }

  if (type === "lifeline") {
    return {
      raw: "shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=1;collapsible=0;fillColor=#f8fafc;strokeColor=#64748b;",
      shape: "lifeline",
      icon: "Life"
    };
  }

  if (type === "state") {
    return {
      raw: "rounded=1;whiteSpace=wrap;html=1;arcSize=40;fillColor=#eef2ff;strokeColor=#4f46e5;",
      shape: "state",
      icon: "State"
    };
  }

  if (type === "task") {
    return {
      raw: "rounded=1;whiteSpace=wrap;html=1;arcSize=10;fillColor=#e0f2fe;strokeColor=#0284c7;",
      shape: "task",
      icon: "Task"
    };
  }

  if (type === "milestone") {
    return {
      raw: "shape=rhombus;whiteSpace=wrap;html=1;fillColor=#fef9c3;strokeColor=#ca8a04;",
      shape: "diamond",
      icon: "M"
    };
  }

  if (type === "region" || type === "external-system") {
    return {
      raw: "rounded=1;whiteSpace=wrap;html=1;dashed=1;fillColor=#f8fafc;strokeColor=#94a3b8;",
      shape: "region",
      icon: type === "external-system" ? "Ext" : undefined
    };
  }

  if (type === "server") {
    return {
      raw: "shape=mxgraph.basic.server;whiteSpace=wrap;html=1;fillColor=#f8fafc;strokeColor=#475569;",
      shape: "server",
      icon: "Srv"
    };
  }

  if (type === "router") {
    return {
      raw: "shape=mxgraph.cisco.routers.router;whiteSpace=wrap;html=1;fillColor=#eff6ff;strokeColor=#2563eb;",
      shape: "router",
      icon: "R"
    };
  }

  if (type === "switch") {
    return {
      raw: "shape=mxgraph.cisco.switches.workgroup_switch;whiteSpace=wrap;html=1;fillColor=#ecfdf5;strokeColor=#059669;",
      shape: "switch",
      icon: "SW"
    };
  }

  if (type === "firewall") {
    return {
      raw: "shape=mxgraph.cisco.security.firewall;whiteSpace=wrap;html=1;fillColor=#fee2e2;strokeColor=#dc2626;",
      shape: "firewall",
      icon: "FW"
    };
  }

  if (type === "load-balancer") {
    return {
      raw: "shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;fillColor=#f5f3ff;strokeColor=#7c3aed;",
      shape: "hexagon",
      icon: "LB"
    };
  }

  if (type === "database" || type === "data-store") {
    return {
      raw: "shape=cylinder3d;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;fillColor=#ecfeff;strokeColor=#0891b2;",
      shape: "cylinder",
      icon: "DB"
    };
  }

  if (type === "gateway") {
    return {
      raw: "shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;fixedSize=1;fillColor=#dbeafe;strokeColor=#2563eb;",
      shape: "hexagon",
      icon: "GW"
    };
  }

  if (type === "queue") {
    return {
      raw: "shape=partialRectangle;whiteSpace=wrap;html=1;right=0;fillColor=#fef3c7;strokeColor=#d97706;",
      shape: "queue",
      icon: "Q"
    };
  }

  if (type === "topic") {
    return {
      raw: "shape=mxgraph.aws4.topic;whiteSpace=wrap;html=1;fillColor=#fff7ed;strokeColor=#ea580c;",
      shape: "topic",
      icon: "Topic"
    };
  }

  if (type === "cache") {
    return {
      raw: "shape=cylinder3d;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;fillColor=#ecfdf5;strokeColor=#059669;",
      shape: "cylinder",
      icon: "C"
    };
  }

  if (type === "storage") {
    return {
      raw: "shape=folder;whiteSpace=wrap;html=1;tabWidth=36;tabHeight=14;fillColor=#f8fafc;strokeColor=#475569;",
      shape: "folder",
      icon: "S"
    };
  }

  if (type === "cloud") {
    return {
      raw: "shape=cloud;whiteSpace=wrap;html=1;fillColor=#eef2ff;strokeColor=#4f46e5;",
      shape: "cloud",
      icon: "CL"
    };
  }

  if (type === "user") {
    return {
      raw: "shape=mxgraph.basic.user;whiteSpace=wrap;html=1;fillColor=#fdf2f8;strokeColor=#db2777;",
      shape: "user",
      icon: "U"
    };
  }

  if (type === "decision") {
    return {
      raw: "shape=rhombus;whiteSpace=wrap;html=1;fillColor=#fef9c3;strokeColor=#ca8a04;",
      shape: "diamond",
      icon: "?"
    };
  }

  if (type === "function") {
    return {
      raw: "shape=process;whiteSpace=wrap;html=1;fillColor=#f5f3ff;strokeColor=#7c3aed;",
      shape: "process",
      icon: "Fn"
    };
  }

  if (type === "document") {
    return {
      raw: "shape=document;whiteSpace=wrap;html=1;boundedLbl=1;fillColor=#f8fafc;strokeColor=#64748b;",
      shape: "document",
      icon: "Doc"
    };
  }

  if (type === "ui-component" || type === "screen" || type === "wireframe") {
    return {
      raw: "rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#64748b;shadow=0;",
      shape: "wireframe",
      icon: "UI"
    };
  }

  return {
    raw: "rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;",
    shape: "rounded",
    icon: type === "service" ? "API" : undefined
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

function numberAttribute(attributes: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = attributes?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function boxFromAttributes(attributes: Record<string, unknown> | undefined, fallback: BoundingBox): BoundingBox {
  return {
    x: numberAttribute(attributes, "x") ?? numberAttribute(attributes, "left") ?? fallback.x,
    y: numberAttribute(attributes, "y") ?? numberAttribute(attributes, "top") ?? fallback.y,
    width: numberAttribute(attributes, "width") ?? fallback.width,
    height: numberAttribute(attributes, "height") ?? fallback.height
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
      boundingBox: boxFromAttributes(node.attributes, nodeBoxes[index]),
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

  return applyDiagramLayout({
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
  }, "optimized");
}
