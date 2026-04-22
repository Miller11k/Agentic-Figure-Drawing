"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { directEditDiagram, revertSession } from "@/features/session/api";
import { useEditorStore } from "@/features/session/store";
import type { SessionHistoryResponse } from "@/features/session/types";
import { applyDirectDiagramEdits } from "@/lib/diagram/direct-edit";
import { applyDiagramLayout, pointsToSvgPath, routeOrthogonalEdge } from "@/lib/diagram/layout";
import { createDrawioXmlFromModel } from "@/lib/xml";
import type { BoundingBox, DiagramEdgeModel, DiagramModel, DiagramNodeModel, DirectDiagramEditOperation } from "@/types";
import { Button } from "@/components/ui";

const DEFAULT_BOX: BoundingBox = { x: 80, y: 80, width: 150, height: 70 };
const SWATCHES = [
  { label: "Warm", fill: "#fff7ed", stroke: "#ea580c" },
  { label: "Blue", fill: "#eff6ff", stroke: "#2563eb" },
  { label: "Green", fill: "#ecfdf5", stroke: "#059669" },
  { label: "Gray", fill: "#f8fafc", stroke: "#475569" }
];
const ELEMENT_PALETTE = [
  { label: "Process", type: "process", style: { raw: "rounded=1;whiteSpace=wrap;html=1;fillColor=#f8fafc;strokeColor=#475569;", shape: "rounded", fillColor: "#f8fafc", strokeColor: "#475569" } },
  { label: "Decision", type: "decision", style: { raw: "shape=rhombus;whiteSpace=wrap;html=1;fillColor=#fef9c3;strokeColor=#ca8a04;", shape: "diamond", fillColor: "#fef9c3", strokeColor: "#ca8a04" } },
  { label: "Start/End", type: "terminator", style: { raw: "ellipse;whiteSpace=wrap;html=1;fillColor=#dcfce7;strokeColor=#16a34a;", shape: "ellipse", fillColor: "#dcfce7", strokeColor: "#16a34a" } },
  { label: "Input", type: "input", style: { raw: "shape=parallelogram;whiteSpace=wrap;html=1;fillColor=#eff6ff;strokeColor=#2563eb;", shape: "parallelogram", fillColor: "#eff6ff", strokeColor: "#2563eb" } },
  { label: "Database", type: "database", style: { raw: "shape=cylinder3d;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;fillColor=#ecfeff;strokeColor=#0891b2;", shape: "cylinder", fillColor: "#ecfeff", strokeColor: "#0891b2" } },
  { label: "Table", type: "table", style: { raw: "shape=table;whiteSpace=wrap;html=1;fillColor=#ecfeff;strokeColor=#0891b2;", shape: "table", fillColor: "#ecfeff", strokeColor: "#0891b2" } },
  { label: "Class", type: "class", style: { raw: "swimlane;whiteSpace=wrap;html=1;startSize=28;fillColor=#f8fafc;strokeColor=#475569;", shape: "class", fillColor: "#f8fafc", strokeColor: "#475569" } },
  { label: "User", type: "user", style: { raw: "shape=mxgraph.basic.user;whiteSpace=wrap;html=1;fillColor=#fdf2f8;strokeColor=#db2777;", shape: "user", fillColor: "#fdf2f8", strokeColor: "#db2777" } },
  { label: "Server", type: "server", style: { raw: "shape=mxgraph.basic.server;whiteSpace=wrap;html=1;fillColor=#f8fafc;strokeColor=#475569;", shape: "server", fillColor: "#f8fafc", strokeColor: "#475569" } },
  { label: "Cloud", type: "cloud", style: { raw: "shape=cloud;whiteSpace=wrap;html=1;fillColor=#eef2ff;strokeColor=#4f46e5;", shape: "cloud", fillColor: "#eef2ff", strokeColor: "#4f46e5" } },
  { label: "Firewall", type: "firewall", style: { raw: "shape=mxgraph.cisco.security.firewall;whiteSpace=wrap;html=1;fillColor=#fee2e2;strokeColor=#dc2626;", shape: "firewall", fillColor: "#fee2e2", strokeColor: "#dc2626" } },
  { label: "Queue", type: "queue", style: { raw: "shape=partialRectangle;whiteSpace=wrap;html=1;right=0;fillColor=#fef3c7;strokeColor=#d97706;", shape: "queue", fillColor: "#fef3c7", strokeColor: "#d97706" } },
  { label: "Document", type: "document", style: { raw: "shape=document;whiteSpace=wrap;html=1;fillColor=#f8fafc;strokeColor=#64748b;", shape: "document", fillColor: "#f8fafc", strokeColor: "#64748b" } },
  { label: "Wireframe", type: "wireframe", style: { raw: "rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#64748b;", shape: "wireframe", fillColor: "#ffffff", strokeColor: "#64748b" } }
] satisfies Array<{ label: string; type: string; style: Record<string, unknown> }>;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const GRID_SIZE = 20;
const MIN_NODE_WIDTH = 64;
const MIN_NODE_HEIGHT = 42;
type CanvasTool = "select" | "pan" | "connect";
type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

function boundsFor(model: DiagramModel) {
  const boxes = model.nodes.map((node) => node.boundingBox).filter(Boolean);

  if (boxes.length === 0) {
    return { minX: 0, minY: 0, width: 2400, height: 1600 };
  }

  const minX = Math.min(...boxes.map((box) => box!.x));
  const minY = Math.min(...boxes.map((box) => box!.y));
  const maxX = Math.max(...boxes.map((box) => box!.x + box!.width));
  const maxY = Math.max(...boxes.map((box) => box!.y + box!.height));
  const viewMinX = Math.min(0, minX - 240);
  const viewMinY = Math.min(0, minY - 240);

  return {
    minX: viewMinX,
    minY: viewMinY,
    width: Math.max(2400, maxX - viewMinX + 600),
    height: Math.max(1600, maxY - viewMinY + 600)
  };
}

function nodeBox(node: DiagramNodeModel): BoundingBox {
  return node.boundingBox ?? DEFAULT_BOX;
}

function styleColor(style: Record<string, unknown>, key: "fillColor" | "strokeColor", fallback: string) {
  if (typeof style[key] === "string") return style[key] as string;
  if (typeof style.raw === "string") {
    const match = style.raw.match(new RegExp(`${key}=([^;]+)`));
    if (match?.[1]) return match[1];
  }
  return fallback;
}

function styleShape(style: Record<string, unknown>, fallback = "rounded") {
  if (typeof style.shape === "string") return style.shape;
  if (typeof style.raw === "string") {
    const match = style.raw.match(/shape=([^;]+)/);
    if (match?.[1]?.includes("cylinder")) return "cylinder";
    if (match?.[1]?.includes("rhombus")) return "diamond";
    if (match?.[1]?.includes("cloud")) return "cloud";
    if (match?.[1]?.includes("folder")) return "folder";
    if (match?.[1]?.includes("document")) return "document";
    if (match?.[1]?.includes("hexagon")) return "hexagon";
    if (match?.[1]?.includes("user")) return "user";
    if (match?.[1]?.includes("image")) return "image";
    if (match?.[1]?.includes("parallelogram")) return "parallelogram";
    if (match?.[1]?.includes("ellipse")) return "ellipse";
    if (match?.[1]?.includes("table")) return "table";
    if (match?.[1]?.includes("umlLifeline")) return "lifeline";
    if (match?.[1]?.includes("partialRectangle")) return "queue";
    if (match?.[1]?.includes("process")) return "process";
    if (match?.[1]?.includes("server")) return "server";
    if (match?.[1]?.includes("firewall")) return "firewall";
    if (match?.[1]?.includes("router")) return "router";
    if (match?.[1]?.includes("switch")) return "switch";
  }
  if (typeof style.raw === "string" && style.raw.startsWith("ellipse;")) return "ellipse";
  return fallback;
}

function styleIcon(node: DiagramNodeModel) {
  if (typeof node.style.icon === "string") return node.style.icon;
  if (node.type === "database") return "DB";
  if (node.type === "table" || node.type === "entity") return "Table";
  if (node.type === "class") return "Class";
  if (node.type === "interface") return "IF";
  if (node.type === "lifeline") return "Life";
  if (node.type === "state") return "State";
  if (node.type === "task") return "Task";
  if (node.type === "server") return "Srv";
  if (node.type === "router") return "R";
  if (node.type === "switch") return "SW";
  if (node.type === "firewall") return "FW";
  if (node.type === "load-balancer") return "LB";
  if (node.type === "ui-component" || node.type === "screen" || node.type === "wireframe") return "UI";
  if (node.type === "service") return "API";
  if (node.type === "gateway") return "GW";
  if (node.type === "topic") return "Topic";
  if (node.type === "external-system") return "Ext";
  if (node.type === "start") return "START";
  if (node.type === "end" || node.type === "terminator") return "END";
  if (node.type === "input") return "IN";
  if (node.type === "output") return "OUT";
  return undefined;
}

function clientPointToSvg(svg: SVGSVGElement, event: PointerEvent<SVGElement>) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM()?.inverse());
}

function nextUntitledLabel(model: DiagramModel) {
  return `New Node ${model.nodes.length + 1}`;
}

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function snap(value: number, enabled: boolean) {
  return enabled ? Math.round(value / GRID_SIZE) * GRID_SIZE : Math.round(value);
}

function autoSizeBoxForText(label: string, current: BoundingBox, shape?: string): BoundingBox {
  const lines = label.split(/\n|<br\s*\/?>/i);
  const longest = Math.max(8, ...lines.map((line) => line.trim().length));
  const totalCharacters = Math.max(label.length, longest);
  const lineCount = Math.max(lines.length, Math.ceil(totalCharacters / 24));
  const shapePadding = shape === "diamond" ? 64 : shape === "ellipse" ? 42 : 34;
  const width = Math.min(360, Math.max(current.width, longest * 7.2 + shapePadding, 120));
  const height = Math.min(240, Math.max(current.height, lineCount * 20 + 44, shape === "diamond" ? 104 : 58));

  return {
    ...current,
    width: Math.round(width),
    height: Math.round(height)
  };
}

export function DiagramWorkspace({ diagramModel, history }: { diagramModel?: DiagramModel; history?: SessionHistoryResponse }) {
  const queryClient = useQueryClient();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
  const [resize, setResize] = useState<{
    nodeId: string;
    handle: ResizeHandle;
    startX: number;
    startY: number;
    originalBox: BoundingBox;
  } | null>(null);
  const [draftModel, setDraftModel] = useState<DiagramModel | undefined>(diagramModel);
  const [error, setError] = useState<string | null>(null);
  const [reconnectMode, setReconnectMode] = useState<"source" | "target" | null>(null);
  const [editingLabel, setEditingLabel] = useState<{ type: "node" | "edge"; id: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<CanvasTool>("select");
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [pendingEdgeStyle, setPendingEdgeStyle] = useState<Record<string, unknown> | undefined>();
  const [panDrag, setPanDrag] = useState<{ x: number; y: number; left: number; top: number } | null>(null);
  const {
    activeSessionId,
    activeVersionId,
    selectedElement,
    pendingEdgeSourceId,
    setActiveVersion,
    setActiveArtifact,
    setDiagramState,
    selectElement,
    setPendingEdgeSource
  } = useEditorStore();

  const model = draftModel ?? diagramModel;

  const directEditMutation = useMutation({
    mutationFn: async (input: { baseModel: DiagramModel; operations: DirectDiagramEditOperation[] }) => {
      if (!activeSessionId) throw new Error("Create a session before editing a diagram.");
      return directEditDiagram(activeSessionId, input.baseModel, input.operations, activeVersionId);
    },
    onSuccess: (result) => {
      setError(null);
      setActiveVersion(result.versionId);
      setActiveArtifact(result.artifactId);
      setDiagramState(result.diagramModel, result.xml);
      setDraftModel(result.diagramModel);
      void queryClient.invalidateQueries({ queryKey: ["session", activeSessionId] });
    },
    onError: (err) => setError((err as Error).message)
  });

  const historyMutation = useMutation({
    mutationFn: (versionId: string) => {
      if (!activeSessionId) throw new Error("Create a session before using undo or redo.");
      return revertSession(activeSessionId, versionId);
    },
    onSuccess: async (result) => {
      setError(null);
      setActiveVersion(result.currentVersionId);
      await queryClient.invalidateQueries({ queryKey: ["session", activeSessionId] });
    },
    onError: (err) => setError((err as Error).message)
  });

  const nodeById = useMemo(() => new Map((model?.nodes ?? []).map((node) => [node.id, node])), [model]);
  const selectedNode = selectedElement?.type === "node" ? nodeById.get(selectedElement.id) : undefined;
  const selectedEdge =
    selectedElement?.type === "edge" ? model?.edges.find((edge) => edge.id === selectedElement.id) : undefined;
  const activeHistoryIndex = history?.steps.findIndex((step) => step.versionId === activeVersionId) ?? -1;
  const undoTarget = history && activeHistoryIndex > 0 ? history.steps[activeHistoryIndex - 1] : undefined;
  const redoTarget =
    history && activeHistoryIndex >= 0 && activeHistoryIndex < history.steps.length - 1
      ? history.steps[activeHistoryIndex + 1]
      : undefined;

  const commit = (operation: DirectDiagramEditOperation, options: { optimistic?: boolean } = {}) => {
    if (!model) return;
    commitOperations([operation], options);
  };

  const commitOperations = (operations: DirectDiagramEditOperation[], options: { optimistic?: boolean } = {}) => {
    if (!model || operations.length === 0) return;
    if (options.optimistic ?? true) {
      try {
        const optimisticModel = applyDirectDiagramEdits(model, operations);
        setDraftModel(optimisticModel);
        setDiagramState(optimisticModel, createDrawioXmlFromModel(optimisticModel));
      } catch (err) {
        setError((err as Error).message);
        return;
      }
    }
    directEditMutation.mutate({ baseModel: model, operations });
  };
  const view = useMemo(() => (model ? boundsFor(model) : { minX: 0, minY: 0, width: 960, height: 620 }), [model]);
  const renderedWidth = Math.max(900, view.width * zoom);
  const renderedHeight = Math.max(560, view.height * zoom);

  const fitToView = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const nextZoom = clampZoom(Math.min((viewport.clientWidth - 48) / view.width, (viewport.clientHeight - 48) / view.height));
    setZoom(Number.isFinite(nextZoom) ? nextZoom : 1);
    requestAnimationFrame(() => {
      viewport.scrollTo({
        left: Math.max(0, (view.width * nextZoom - viewport.clientWidth) / 2),
        top: Math.max(0, (view.height * nextZoom - viewport.clientHeight) / 2),
        behavior: "smooth"
      });
    });
  }, [view.height, view.width]);

  useEffect(() => {
    setDraftModel(diagramModel);
  }, [diagramModel]);

  const updateDraftNodePosition = (nodeId: string, x: number, y: number) => {
    setDraftModel((current) => {
      if (!current) return current;
      return {
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                boundingBox: {
                  ...nodeBox(node),
                  x,
                  y
                }
              }
            : node
        )
      };
    });
  };

  const updateDraftNodeBox = (nodeId: string, box: BoundingBox) => {
    setDraftModel((current) => {
      if (!current) return current;
      return {
        ...current,
        nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, boundingBox: box } : node))
      };
    });
  };

  const startResize = (event: PointerEvent<SVGRectElement>, node: DiagramNodeModel, handle: ResizeHandle) => {
    const svg = svgRef.current;
    if (!svg) return;
    event.stopPropagation();
    event.preventDefault();
    const point = clientPointToSvg(svg, event);
    selectElement({ type: "node", id: node.id });
    setResize({
      nodeId: node.id,
      handle,
      startX: point.x,
      startY: point.y,
      originalBox: nodeBox(node)
    });
  };

  const resizedBox = (pointX: number, pointY: number): BoundingBox | undefined => {
    if (!resize) return undefined;
    const dx = pointX - resize.startX;
    const dy = pointY - resize.startY;
    const box = resize.originalBox;
    const next = { ...box };

    if (resize.handle.includes("e")) {
      next.width = Math.max(MIN_NODE_WIDTH, box.width + dx);
    }
    if (resize.handle.includes("s")) {
      next.height = Math.max(MIN_NODE_HEIGHT, box.height + dy);
    }
    if (resize.handle.includes("w")) {
      const width = Math.max(MIN_NODE_WIDTH, box.width - dx);
      next.x = box.x + box.width - width;
      next.width = width;
    }
    if (resize.handle.includes("n")) {
      const height = Math.max(MIN_NODE_HEIGHT, box.height - dy);
      next.y = box.y + box.height - height;
      next.height = height;
    }

    return {
      x: snap(next.x, snapToGrid),
      y: snap(next.y, snapToGrid),
      width: Math.max(MIN_NODE_WIDTH, snap(next.width, snapToGrid)),
      height: Math.max(MIN_NODE_HEIGHT, snap(next.height, snapToGrid))
    };
  };

  const handleNodePointerDown = (event: PointerEvent<SVGGElement>, node: DiagramNodeModel) => {
    const svg = svgRef.current;
    if (!svg) return;

    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = clientPointToSvg(svg, event);
    const box = nodeBox(node);
    selectElement({ type: "node", id: node.id });

    if (pendingEdgeSourceId && pendingEdgeSourceId !== node.id) {
      commit({ type: "add-edge", edge: { sourceId: pendingEdgeSourceId, targetId: node.id, style: pendingEdgeStyle } });
      setPendingEdgeSource(undefined);
      setPendingEdgeStyle(undefined);
      setTool("select");
      return;
    }

    if (tool === "connect") {
      setPendingEdgeSource(node.id);
      return;
    }

    if (selectedEdge && reconnectMode) {
      commit(
        reconnectMode === "source"
          ? { type: "reconnect-edge", edgeId: selectedEdge.id, sourceId: node.id }
          : { type: "reconnect-edge", edgeId: selectedEdge.id, targetId: node.id }
      );
      setReconnectMode(null);
      return;
    }

    if (tool === "select") {
      setDrag({ nodeId: node.id, offsetX: point.x - box.x, offsetY: point.y - box.y });
    }
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (resize && svgRef.current) {
      const point = clientPointToSvg(svgRef.current, event);
      const nextBox = resizedBox(point.x, point.y);
      if (nextBox) updateDraftNodeBox(resize.nodeId, nextBox);
      return;
    }
    if (!drag || !svgRef.current) return;
    const point = clientPointToSvg(svgRef.current, event);
    updateDraftNodePosition(drag.nodeId, snap(point.x - drag.offsetX, snapToGrid), snap(point.y - drag.offsetY, snapToGrid));
  };

  const handlePointerUp = () => {
    if (resize && draftModel) {
      const node = draftModel.nodes.find((candidate) => candidate.id === resize.nodeId);
      const box = node ? nodeBox(node) : undefined;
      setResize(null);
      if (node && box) {
        commit({
          type: "resize-node",
          nodeId: node.id,
          x: snap(box.x, snapToGrid),
          y: snap(box.y, snapToGrid),
          width: Math.max(MIN_NODE_WIDTH, snap(box.width, snapToGrid)),
          height: Math.max(MIN_NODE_HEIGHT, snap(box.height, snapToGrid))
        });
      }
      return;
    }
    if (!drag || !draftModel) {
      setDrag(null);
      return;
    }
    const node = draftModel.nodes.find((candidate) => candidate.id === drag.nodeId);
    const box = node ? nodeBox(node) : undefined;
    setDrag(null);
    if (node && box) {
      commit({ type: "move-node", nodeId: node.id, x: snap(box.x, snapToGrid), y: snap(box.y, snapToGrid) });
    }
  };

  const viewportCenter = () => {
    const viewport = viewportRef.current;
    if (!viewport) return { x: view.minX + 120, y: view.minY + 120 };
    return {
      x: view.minX + ((viewport.scrollLeft + viewport.clientWidth / 2) / renderedWidth) * view.width - DEFAULT_BOX.width / 2,
      y: view.minY + ((viewport.scrollTop + viewport.clientHeight / 2) / renderedHeight) * view.height - DEFAULT_BOX.height / 2
    };
  };

  const addNode = (style?: Record<string, unknown>, label?: string, type?: string) => {
    if (!model) return;
    const center = viewportCenter();
    const nodeLabel = label ?? nextUntitledLabel(model);
    const box = autoSizeBoxForText(nodeLabel, { ...DEFAULT_BOX, x: snap(center.x, snapToGrid), y: snap(center.y, snapToGrid) }, String(style?.shape ?? type ?? ""));
    commit({
      type: "add-node",
      node: {
        label: nodeLabel,
        type,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        style
      }
    });
  };

  const duplicateSelected = () => {
    if (!selectedNode) return;
    const box = nodeBox(selectedNode);
    commit({
      type: "add-node",
      node: {
        label: `${selectedNode.label} copy`,
        x: snap(box.x + 48, snapToGrid),
        y: snap(box.y + 48, snapToGrid),
        width: box.width,
        height: box.height,
        groupId: selectedNode.groupId,
        style: { ...selectedNode.style }
      }
    });
  };

  const nudgeSelected = (dx: number, dy: number) => {
    if (!selectedNode) return;
    const box = nodeBox(selectedNode);
    commit({ type: "move-node", nodeId: selectedNode.id, x: snap(box.x + dx, snapToGrid), y: snap(box.y + dy, snapToGrid) });
  };

  const autoLayout = () => {
    if (!model) return;
    const laidOut = applyDiagramLayout(model, "optimized");
    setDraftModel(laidOut);
    setDiagramState(laidOut, createDrawioXmlFromModel(laidOut));
    const operations = laidOut.nodes
      .map((node) => ({ node, box: node.boundingBox }))
      .filter((item): item is { node: DiagramNodeModel; box: BoundingBox } => Boolean(item.box))
      .map((item) => ({
        type: "move-node" as const,
        nodeId: item.node.id,
        x: item.box.x,
        y: item.box.y
      }));

    if (operations.length > 0) {
      directEditMutation.mutate({ baseModel: model, operations });
    }
  };

  const removeSelected = () => {
    if (selectedNode) {
      commit({ type: "delete-node", nodeId: selectedNode.id });
      selectElement(undefined);
    }
    if (selectedEdge) {
      commit({ type: "delete-edge", edgeId: selectedEdge.id });
      selectElement(undefined);
    }
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.08 : 0.08;
    setZoom((current) => clampZoom(Number((current + delta).toFixed(2))));
  };

  const handleViewportPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (tool !== "pan" && event.button !== 1) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    event.preventDefault();
    setPanDrag({ x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop });
  };

  const handleViewportPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!panDrag || !viewportRef.current) return;
    viewportRef.current.scrollLeft = panDrag.left - (event.clientX - panDrag.x);
    viewportRef.current.scrollTop = panDrag.top - (event.clientY - panDrag.y);
  };

  const handleViewportPointerUp = () => setPanDrag(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey && redoTarget) {
          historyMutation.mutate(redoTarget.versionId);
        } else if (undoTarget) {
          historyMutation.mutate(undoTarget.versionId);
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        if (redoTarget) historyMutation.mutate(redoTarget.versionId);
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeSelected();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === "+" || event.key === "=")) {
        event.preventDefault();
        setZoom((current) => clampZoom(Number((current + 0.1).toFixed(2))));
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "-") {
        event.preventDefault();
        setZoom((current) => clampZoom(Number((current - 0.1).toFixed(2))));
      }
      const nudge = event.shiftKey ? GRID_SIZE : 5;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        nudgeSelected(-nudge, 0);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        nudgeSelected(nudge, 0);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        nudgeSelected(0, -nudge);
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        nudgeSelected(0, nudge);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (!model || model.nodes.length === 0) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center rounded-[32px] border border-dashed border-slate-300/80 bg-white/62 shadow-inner backdrop-blur-xl">
        <div className="max-w-md text-center">
          <p className="text-xl font-semibold tracking-[-0.03em] text-slate-900">No diagram loaded</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Create a session, import Draw.io XML, or generate a diagram from a prompt to populate this workspace.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[520px] flex-col overflow-hidden rounded-[32px] border border-white/70 bg-white/70 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/70 bg-white/58 p-3">
        <div className="flex h-10 overflow-hidden rounded-full border border-slate-200 bg-slate-100/80 p-1 text-sm">
          {(["select", "pan", "connect"] as const).map((item) => (
            <button
              key={item}
              className={`rounded-full px-3 capitalize transition ${tool === item ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
              onClick={() => {
                setTool(item);
                if (item !== "connect") {
                  setPendingEdgeSource(undefined);
                  setPendingEdgeStyle(undefined);
                }
              }}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
        <div className="flex h-10 overflow-hidden rounded-full border border-slate-200 bg-slate-100/80 p-1 text-sm">
          <button
            className="rounded-full px-3 font-semibold text-slate-600 transition hover:bg-white hover:text-slate-950 disabled:opacity-35"
            disabled={!undoTarget || historyMutation.isPending}
            onClick={() => undoTarget && historyMutation.mutate(undoTarget.versionId)}
            type="button"
          >
            Undo
          </button>
          <button
            className="rounded-full px-3 font-semibold text-slate-600 transition hover:bg-white hover:text-slate-950 disabled:opacity-35"
            disabled={!redoTarget || historyMutation.isPending}
            onClick={() => redoTarget && historyMutation.mutate(redoTarget.versionId)}
            type="button"
          >
            Redo
          </button>
        </div>
        <Button onClick={() => addNode()} disabled={directEditMutation.isPending}>
          Add node
        </Button>
        <Button onClick={duplicateSelected} disabled={!selectedNode || directEditMutation.isPending}>
          Duplicate
        </Button>
        <Button onClick={removeSelected} disabled={!selectedElement || directEditMutation.isPending}>
          Delete selected
        </Button>
        <Button
          disabled={!selectedNode}
          onClick={() => {
            if (selectedNode) {
              setPendingEdgeSource(selectedNode.id);
              setPendingEdgeStyle(undefined);
              setTool("connect");
            }
          }}
        >
          Start edge
        </Button>
        <Button
          disabled={!selectedEdge}
          onClick={() => setReconnectMode("target")}
        >
          Reconnect target
        </Button>
        <Button
          disabled={!selectedEdge}
          onClick={() => setReconnectMode("source")}
        >
          Reconnect source
        </Button>
        <Button onClick={autoLayout} disabled={directEditMutation.isPending}>
          Optimize layout
        </Button>
        <div className="flex h-10 items-center overflow-hidden rounded-full border border-slate-200 bg-slate-100/80 p-1 text-sm">
          <button
            className="rounded-full px-3 text-slate-500 transition hover:bg-white hover:text-slate-900"
            onClick={() => setZoom((current) => clampZoom(Number((current - 0.1).toFixed(2))))}
            type="button"
          >
            -
          </button>
          <button
            className="rounded-full px-3 font-medium text-slate-700 transition hover:bg-white"
            onClick={fitToView}
            type="button"
          >
            Fit
          </button>
          <button
            className="rounded-full px-3 text-slate-500 transition hover:bg-white hover:text-slate-900"
            onClick={() => setZoom((current) => clampZoom(Number((current + 0.1).toFixed(2))))}
            type="button"
          >
            +
          </button>
          <button
            className="rounded-full px-3 text-slate-500 transition hover:bg-white hover:text-slate-900"
            onClick={() => setZoom(1)}
            type="button"
          >
            {Math.round(zoom * 100)}%
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            className={`h-10 rounded-full border px-3 text-sm font-semibold transition ${snapToGrid ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white/70 text-slate-500"}`}
            onClick={() => setSnapToGrid((value) => !value)}
            type="button"
          >
            Snap {snapToGrid ? "on" : "off"}
          </button>
          {SWATCHES.map((swatch) => (
            <button
              key={swatch.label}
              className="h-8 w-8 rounded-full border border-white shadow-sm ring-1 ring-slate-200 transition hover:scale-105 disabled:opacity-35"
              style={{ background: swatch.fill }}
              title={swatch.label}
              disabled={!selectedNode}
              onClick={() =>
                selectedNode &&
                commit({
                  type: "update-node-style",
                  nodeId: selectedNode.id,
                  style: {
                    fillColor: swatch.fill,
                    strokeColor: swatch.stroke,
                    raw: `rounded=1;whiteSpace=wrap;html=1;fillColor=${swatch.fill};strokeColor=${swatch.stroke};`
                  }
                })
              }
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-200/70 bg-white/45 px-3 py-2">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Elements</span>
        {ELEMENT_PALETTE.map((item) => (
          <button
            key={item.type}
            className="shrink-0 rounded-full border border-slate-200 bg-white/75 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-white disabled:opacity-40"
            disabled={directEditMutation.isPending}
            onClick={() => addNode(item.style, item.label, item.type)}
            title={`Add ${item.label}`}
            type="button"
          >
            {item.label}
          </button>
        ))}
        <span className="ml-2 shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Arrows</span>
        <button
          className="shrink-0 rounded-full border border-slate-200 bg-white/75 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white disabled:opacity-40"
          disabled={!selectedNode}
          onClick={() => {
            if (selectedNode) {
              setPendingEdgeSource(selectedNode.id);
              setPendingEdgeStyle(undefined);
              setTool("connect");
            }
          }}
          type="button"
        >
          Solid arrow
        </button>
        <button
          className="shrink-0 rounded-full border border-slate-200 bg-white/75 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white disabled:opacity-40"
          disabled={!selectedNode}
          onClick={() => {
            if (selectedNode) {
              setPendingEdgeSource(selectedNode.id);
              setPendingEdgeStyle({
                raw: "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;dashed=1;",
                dashed: true
              });
              setTool("connect");
            }
          }}
          type="button"
        >
          Dashed arrow
        </button>
      </div>

      {(pendingEdgeSourceId || reconnectMode || error || directEditMutation.isPending || historyMutation.isPending) && (
        <div className="border-b border-slate-200/70 bg-white/72 px-4 py-3 text-sm">
          {pendingEdgeSourceId ? <span className="text-blue-700">Click a target node to create an edge from {pendingEdgeSourceId}.</span> : null}
          {reconnectMode ? <span className="text-blue-700">Click a node to reconnect the edge {reconnectMode}.</span> : null}
          {directEditMutation.isPending ? <span className="text-amber-700">Saving structured edit...</span> : null}
          {historyMutation.isPending ? <span className="text-amber-700">Restoring diagram version...</span> : null}
          {error ? <span className="text-red-700">{error}</span> : null}
        </div>
      )}

      <div
        ref={viewportRef}
        className={`min-h-0 flex-1 overflow-auto bg-[linear-gradient(135deg,rgba(248,250,252,0.96),rgba(255,255,255,0.74))] ${tool === "pan" ? "cursor-grab" : ""}`}
        onWheel={handleWheel}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerUp}
        onPointerLeave={handleViewportPointerUp}
      >
        <svg
          ref={svgRef}
          className="touch-none"
          style={{
            width: renderedWidth,
            height: renderedHeight,
            backgroundColor: "#ffffff",
            backgroundImage: snapToGrid
              ? "linear-gradient(rgba(148,163,184,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.18) 1px, transparent 1px)"
              : undefined,
            backgroundSize: snapToGrid ? `${GRID_SIZE * zoom}px ${GRID_SIZE * zoom}px` : undefined
          }}
          viewBox={`${view.minX} ${view.minY} ${view.width} ${view.height}`}
          role="application"
          aria-label="Interactive diagram editor"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerDown={() => selectElement(undefined)}
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#334155" />
            </marker>
          </defs>

          {model.groups.map((group) => {
            const box = group.boundingBox;
            if (!box) return null;
            return (
              <g key={group.id} onPointerDown={(event) => {
                event.stopPropagation();
                selectElement({ type: "group", id: group.id });
              }}>
                <rect x={box.x} y={box.y} width={box.width} height={box.height} rx="14" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5" opacity="0.78" />
                <text x={box.x + 14} y={box.y + 24} fill="#334155" fontSize="14" fontWeight="600">
                  {group.label}
                </text>
              </g>
            );
          })}

          {model.edges.map((edge: DiagramEdgeModel) => {
            const source = nodeById.get(edge.sourceId)?.boundingBox;
            const target = nodeById.get(edge.targetId)?.boundingBox;
            if (!source || !target) return null;
            const route = routeOrthogonalEdge(source, target);
            const selected = selectedElement?.type === "edge" && selectedElement.id === edge.id;
            const edgeStroke = styleColor(edge.style, "strokeColor", selected ? "#0f766e" : "#334155");
            const dashed =
              edge.style.dashed === true ||
              edge.style.dashed === "1" ||
              (typeof edge.style.raw === "string" && edge.style.raw.includes("dashed=1"));
            const strokeWidth = typeof edge.style.strokeWidth === "number" ? edge.style.strokeWidth : selected ? 4 : 2;
            const labelWidth = edge.label ? Math.max(56, Math.min(220, edge.label.length * 7 + 20)) : 0;
            const isEditing = editingLabel?.type === "edge" && editingLabel.id === edge.id;
            return (
              <g
                key={edge.id}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  selectElement({ type: "edge", id: edge.id });
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  setEditingLabel({ type: "edge", id: edge.id });
                }}
              >
                <path d={pointsToSvgPath(route.points)} fill="none" stroke={edgeStroke} strokeWidth={strokeWidth} strokeDasharray={dashed ? "8 6" : undefined} markerEnd="url(#arrow)" />
                {isEditing ? (
                  <foreignObject x={route.labelPoint.x - 90} y={route.labelPoint.y - 24} width="180" height="42">
                    <input
                      autoFocus
                      className="h-8 w-full rounded-xl border border-slate-300 bg-white px-2 text-center text-xs font-semibold text-slate-800 shadow-sm outline-none"
                      defaultValue={edge.label ?? ""}
                      placeholder="Edge label"
                      onPointerDown={(event) => event.stopPropagation()}
                      onBlur={(event) => {
                        commit({ type: "update-edge-label", edgeId: edge.id, label: event.currentTarget.value });
                        setEditingLabel(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                        if (event.key === "Escape") {
                          setEditingLabel(null);
                        }
                      }}
                    />
                  </foreignObject>
                ) : edge.label ? (
                  <g>
                    <rect
                      x={route.labelPoint.x - labelWidth / 2}
                      y={route.labelPoint.y - 17}
                      width={labelWidth}
                      height="22"
                      rx="8"
                      fill="#ffffff"
                      stroke="#e2e8f0"
                      opacity="0.96"
                    />
                    <text x={route.labelPoint.x} y={route.labelPoint.y - 2} fill="#475569" fontSize="12" fontWeight="600" textAnchor="middle">
                      {edge.label}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}

          {model.nodes.map((node) => {
            const box = nodeBox(node);
            const selected = selectedElement?.type === "node" && selectedElement.id === node.id;
            const fill = styleColor(node.style, "fillColor", node.type === "database" ? "#ecfeff" : "#fff7ed");
            const stroke = selected ? "#0f766e" : styleColor(node.style, "strokeColor", node.type === "database" ? "#0891b2" : "#ea580c");
            const shape = styleShape(node.style, node.type === "database" ? "cylinder" : "rounded");
            const icon = styleIcon(node);
            const isEditing = editingLabel?.type === "node" && editingLabel.id === node.id;
            return (
              <g
                key={node.id}
                onPointerDown={(event) => handleNodePointerDown(event, node)}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  setEditingLabel({ type: "node", id: node.id });
                }}
              >
                {shape === "diamond" ? (
                  <polygon points={`${box.x + box.width / 2},${box.y} ${box.x + box.width},${box.y + box.height / 2} ${box.x + box.width / 2},${box.y + box.height} ${box.x},${box.y + box.height / 2}`} fill={fill} stroke={stroke} strokeWidth={selected ? 3 : 1.5} filter={selected ? "drop-shadow(0 14px 20px rgba(15, 118, 110, 0.18))" : undefined} />
                ) : shape === "cylinder" ? (
                  <>
                    <rect x={box.x} y={box.y + 9} width={box.width} height={box.height - 18} fill={fill} stroke={stroke} strokeWidth={selected ? 3 : 1.5} />
                    <ellipse cx={box.x + box.width / 2} cy={box.y + 9} rx={box.width / 2} ry="9" fill={fill} stroke={stroke} strokeWidth={selected ? 3 : 1.5} />
                    <ellipse cx={box.x + box.width / 2} cy={box.y + box.height - 9} rx={box.width / 2} ry="9" fill={fill} stroke={stroke} strokeWidth={selected ? 3 : 1.5} />
                  </>
                ) : shape === "cloud" ? (
                  <path d={`M ${box.x + 36} ${box.y + box.height - 14} H ${box.x + box.width - 26} C ${box.x + box.width + 20} ${box.y + box.height - 18}, ${box.x + box.width + 4} ${box.y + 18}, ${box.x + box.width - 28} ${box.y + 22} C ${box.x + box.width - 48} ${box.y - 6}, ${box.x + 64} ${box.y - 2}, ${box.x + 56} ${box.y + 22} C ${box.x + 14} ${box.y + 16}, ${box.x - 4} ${box.y + box.height - 12}, ${box.x + 36} ${box.y + box.height - 14} Z`} fill={fill} stroke={stroke} strokeWidth={selected ? 3 : 1.5} />
                ) : shape === "hexagon" ? (
                  <polygon points={`${box.x + 24},${box.y} ${box.x + box.width - 24},${box.y} ${box.x + box.width},${box.y + box.height / 2} ${box.x + box.width - 24},${box.y + box.height} ${box.x + 24},${box.y + box.height} ${box.x},${box.y + box.height / 2}`} fill={fill} stroke={stroke} strokeWidth={selected ? 3 : 1.5} />
                ) : shape === "parallelogram" ? (
                  <polygon points={`${box.x + 24},${box.y} ${box.x + box.width},${box.y} ${box.x + box.width - 24},${box.y + box.height} ${box.x},${box.y + box.height}`} fill={fill} stroke={stroke} strokeWidth={selected ? 3 : 1.5} />
                ) : shape === "ellipse" ? (
                  <ellipse cx={box.x + box.width / 2} cy={box.y + box.height / 2} rx={box.width / 2} ry={box.height / 2} fill={fill} stroke={stroke} strokeWidth={selected ? 3 : 1.5} />
                ) : shape === "table" || shape === "class" || shape === "lifeline" ? (
                  <>
                    <rect x={box.x} y={box.y} width={box.width} height={box.height} rx="8" fill={fill} stroke={stroke} strokeWidth={selected ? 3 : 1.5} />
                    <line x1={box.x} y1={box.y + 28} x2={box.x + box.width} y2={box.y + 28} stroke={stroke} strokeWidth="1.2" />
                    {shape === "lifeline" ? (
                      <line x1={box.x + box.width / 2} y1={box.y + 28} x2={box.x + box.width / 2} y2={box.y + box.height + 72} stroke={stroke} strokeDasharray="7 6" strokeWidth="1.5" />
                    ) : null}
                  </>
                ) : shape === "queue" ? (
                  <>
                    <rect x={box.x} y={box.y} width={box.width} height={box.height} rx="10" fill={fill} stroke={stroke} strokeWidth={selected ? 3 : 1.5} />
                    <line x1={box.x + box.width - 22} y1={box.y} x2={box.x + box.width - 22} y2={box.y + box.height} stroke={stroke} strokeWidth="1.2" />
                  </>
                ) : shape === "server" ? (
                  <>
                    <rect x={box.x} y={box.y} width={box.width} height={box.height} rx="8" fill={fill} stroke={stroke} strokeWidth={selected ? 3 : 1.5} />
                    <line x1={box.x} y1={box.y + 24} x2={box.x + box.width} y2={box.y + 24} stroke={stroke} opacity="0.55" />
                    <line x1={box.x} y1={box.y + 46} x2={box.x + box.width} y2={box.y + 46} stroke={stroke} opacity="0.55" />
                  </>
                ) : shape === "firewall" ? (
                  <>
                    <rect x={box.x} y={box.y} width={box.width} height={box.height} rx="8" fill={fill} stroke={stroke} strokeWidth={selected ? 3 : 1.5} />
                    {[0, 1, 2].map((row) => (
                      <g key={row}>
                        <line x1={box.x} y1={box.y + 20 + row * 18} x2={box.x + box.width} y2={box.y + 20 + row * 18} stroke={stroke} opacity="0.35" />
                        <line x1={box.x + box.width / 2 + (row % 2 ? 18 : -18)} y1={box.y + row * 18} x2={box.x + box.width / 2 + (row % 2 ? 18 : -18)} y2={box.y + 20 + row * 18} stroke={stroke} opacity="0.35" />
                      </g>
                    ))}
                  </>
                ) : shape === "router" || shape === "switch" ? (
                  <>
                    <rect x={box.x} y={box.y + 10} width={box.width} height={box.height - 20} rx="16" fill={fill} stroke={stroke} strokeWidth={selected ? 3 : 1.5} />
                    <path d={`M ${box.x + 24} ${box.y + box.height / 2} H ${box.x + box.width - 24} M ${box.x + box.width - 36} ${box.y + box.height / 2 - 10} L ${box.x + box.width - 24} ${box.y + box.height / 2} L ${box.x + box.width - 36} ${box.y + box.height / 2 + 10}`} fill="none" stroke={stroke} strokeWidth="1.5" />
                  </>
                ) : shape === "wireframe" ? (
                  <>
                    <rect x={box.x} y={box.y} width={box.width} height={box.height} rx="8" fill={fill} stroke={stroke} strokeWidth={selected ? 3 : 1.5} />
                    <rect x={box.x + 10} y={box.y + 12} width={box.width - 20} height="12" rx="4" fill="none" stroke={stroke} opacity="0.45" />
                    <rect x={box.x + 10} y={box.y + box.height - 24} width={Math.max(32, box.width * 0.38)} height="12" rx="4" fill="none" stroke={stroke} opacity="0.45" />
                  </>
                ) : shape === "user" ? (
                  <>
                    <circle cx={box.x + box.width / 2} cy={box.y + 24} r="13" fill={fill} stroke={stroke} strokeWidth={selected ? 3 : 1.5} />
                    <path d={`M ${box.x + box.width / 2} ${box.y + 39} V ${box.y + box.height - 18} M ${box.x + box.width / 2 - 26} ${box.y + 56} H ${box.x + box.width / 2 + 26} M ${box.x + box.width / 2} ${box.y + box.height - 18} L ${box.x + box.width / 2 - 22} ${box.y + box.height} M ${box.x + box.width / 2} ${box.y + box.height - 18} L ${box.x + box.width / 2 + 22} ${box.y + box.height}`} fill="none" stroke={stroke} strokeWidth={selected ? 3 : 1.5} />
                  </>
                ) : shape === "folder" ? (
                  <path d={`M ${box.x} ${box.y + 14} H ${box.x + 48} L ${box.x + 60} ${box.y} H ${box.x + box.width} V ${box.y + box.height} H ${box.x} Z`} fill={fill} stroke={stroke} strokeWidth={selected ? 3 : 1.5} />
                ) : shape === "image" ? (
                  <rect x={box.x} y={box.y} width={box.width} height={box.height} rx="8" fill="#ffffff" stroke={stroke} strokeDasharray="6 5" strokeWidth={selected ? 3 : 1.5} />
                ) : (
                  <rect x={box.x} y={box.y} width={box.width} height={box.height} rx="14" fill={fill} stroke={stroke} strokeWidth={selected ? 3 : 1.5} filter={selected ? "drop-shadow(0 14px 20px rgba(15, 118, 110, 0.18))" : undefined} />
                )}
                {icon ? (
                  <text x={box.x + 14} y={box.y + 20} fill={stroke} fontSize="10" fontWeight="700">
                    {icon}
                  </text>
                ) : null}
                {isEditing ? (
                  <foreignObject x={box.x + 8} y={box.y + box.height / 2 - 18} width={box.width - 16} height="40">
                    <input
                      autoFocus
                      className="h-9 w-full rounded-xl border border-slate-300 bg-white px-2 text-center text-sm font-semibold text-slate-900 shadow-sm outline-none"
                      defaultValue={node.label}
                      onPointerDown={(event) => event.stopPropagation()}
                      onBlur={(event) => {
                        const label = event.currentTarget.value.trim();
                        if (label) {
                          const nextBox = autoSizeBoxForText(label, box, shape);
                          commitOperations([
                            { type: "rename-node", nodeId: node.id, label },
                            {
                              type: "resize-node",
                              nodeId: node.id,
                              x: nextBox.x,
                              y: nextBox.y,
                              width: nextBox.width,
                              height: nextBox.height
                            }
                          ]);
                        }
                        setEditingLabel(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                        if (event.key === "Escape") {
                          setEditingLabel(null);
                        }
                      }}
                    />
                  </foreignObject>
                ) : (
                  <foreignObject x={box.x + 12} y={box.y + 24} width={box.width - 24} height={Math.max(34, box.height - 34)}>
                    <div className="flex h-full items-center justify-center text-center text-sm font-semibold leading-snug text-slate-950">
                      <span className="break-words">{node.label}</span>
                    </div>
                  </foreignObject>
                )}
                {selected
                  ? (["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((handle) => {
                      const cx =
                        handle.includes("w") ? box.x : handle.includes("e") ? box.x + box.width : box.x + box.width / 2;
                      const cy =
                        handle.includes("n") ? box.y : handle.includes("s") ? box.y + box.height : box.y + box.height / 2;
                      const cursor =
                        handle === "n" || handle === "s"
                          ? "ns-resize"
                          : handle === "e" || handle === "w"
                            ? "ew-resize"
                            : handle === "nw" || handle === "se"
                              ? "nwse-resize"
                              : "nesw-resize";
                      return (
                        <rect
                          key={handle}
                          x={cx - 5}
                          y={cy - 5}
                          width="10"
                          height="10"
                          rx="3"
                          fill="#ffffff"
                          stroke="#0f766e"
                          strokeWidth="1.5"
                          style={{ cursor }}
                          onPointerDown={(event) => startResize(event, node, handle)}
                        />
                      );
                    })
                  : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
