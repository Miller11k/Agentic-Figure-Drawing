"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { directEditDiagram } from "@/features/session/api";
import { useEditorStore } from "@/features/session/store";
import { applyDiagramLayout, pointsToSvgPath, routeOrthogonalEdge, type DiagramLayoutMode } from "@/lib/diagram/layout";
import type { BoundingBox, DiagramEdgeModel, DiagramModel, DiagramNodeModel, DirectDiagramEditOperation } from "@/types";

const DEFAULT_BOX: BoundingBox = { x: 80, y: 80, width: 150, height: 70 };
const SWATCHES = [
  { label: "Warm", fill: "#fff7ed", stroke: "#ea580c" },
  { label: "Blue", fill: "#eff6ff", stroke: "#2563eb" },
  { label: "Green", fill: "#ecfdf5", stroke: "#059669" },
  { label: "Gray", fill: "#f8fafc", stroke: "#475569" }
];

function boundsFor(model: DiagramModel) {
  const boxes = model.nodes.map((node) => node.boundingBox).filter(Boolean);

  if (boxes.length === 0) {
    return { minX: 0, minY: 0, width: 900, height: 560 };
  }

  const minX = Math.min(...boxes.map((box) => box!.x));
  const minY = Math.min(...boxes.map((box) => box!.y));
  const maxX = Math.max(...boxes.map((box) => box!.x + box!.width));
  const maxY = Math.max(...boxes.map((box) => box!.y + box!.height));

  return {
    minX: Math.max(0, minX - 120),
    minY: Math.max(0, minY - 120),
    width: Math.max(960, maxX - minX + 300),
    height: Math.max(620, maxY - minY + 300)
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

function clientPointToSvg(svg: SVGSVGElement, event: PointerEvent<SVGElement>) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM()?.inverse());
}

function nextUntitledLabel(model: DiagramModel) {
  return `New Node ${model.nodes.length + 1}`;
}

export function DiagramWorkspace({ diagramModel }: { diagramModel?: DiagramModel }) {
  const queryClient = useQueryClient();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
  const [draftModel, setDraftModel] = useState<DiagramModel | undefined>(diagramModel);
  const [error, setError] = useState<string | null>(null);
  const [reconnectMode, setReconnectMode] = useState<"source" | "target" | null>(null);
  const [layoutMode, setLayoutMode] = useState<DiagramLayoutMode>("hierarchical");
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

  useEffect(() => {
    setDraftModel(diagramModel);
  }, [diagramModel]);

  const directEditMutation = useMutation({
    mutationFn: async (operations: DirectDiagramEditOperation[]) => {
      if (!activeSessionId) throw new Error("Create a session before editing a diagram.");
      if (!model) throw new Error("No diagram model is loaded.");
      return directEditDiagram(activeSessionId, model, operations, activeVersionId);
    },
    onSuccess: async (result) => {
      setError(null);
      setActiveVersion(result.versionId);
      setActiveArtifact(result.artifactId);
      setDiagramState(result.diagramModel, result.xml);
      setDraftModel(result.diagramModel);
      await queryClient.invalidateQueries({ queryKey: ["session", activeSessionId] });
    },
    onError: (err) => setError((err as Error).message)
  });

  const nodeById = useMemo(() => new Map((model?.nodes ?? []).map((node) => [node.id, node])), [model]);
  const selectedNode = selectedElement?.type === "node" ? nodeById.get(selectedElement.id) : undefined;
  const selectedEdge =
    selectedElement?.type === "edge" ? model?.edges.find((edge) => edge.id === selectedElement.id) : undefined;

  const commit = (operation: DirectDiagramEditOperation) => directEditMutation.mutate([operation]);

  if (!model || model.nodes.length === 0) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center border border-dashed border-slate-300 bg-white">
        <div className="max-w-md text-center">
          <p className="text-lg font-semibold text-slate-800">No diagram loaded</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Create a session, import Draw.io XML, or generate a diagram from a prompt to populate this workspace.
          </p>
        </div>
      </div>
    );
  }

  const view = boundsFor(model);

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

  const handleNodePointerDown = (event: PointerEvent<SVGGElement>, node: DiagramNodeModel) => {
    const svg = svgRef.current;
    if (!svg) return;

    event.stopPropagation();
    const point = clientPointToSvg(svg, event);
    const box = nodeBox(node);
    selectElement({ type: "node", id: node.id });

    if (pendingEdgeSourceId && pendingEdgeSourceId !== node.id) {
      commit({ type: "add-edge", edge: { sourceId: pendingEdgeSourceId, targetId: node.id } });
      setPendingEdgeSource(undefined);
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

    setDrag({ nodeId: node.id, offsetX: point.x - box.x, offsetY: point.y - box.y });
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag || !svgRef.current) return;
    const point = clientPointToSvg(svgRef.current, event);
    updateDraftNodePosition(drag.nodeId, Math.round(point.x - drag.offsetX), Math.round(point.y - drag.offsetY));
  };

  const handlePointerUp = () => {
    if (!drag || !draftModel) {
      setDrag(null);
      return;
    }
    const node = draftModel.nodes.find((candidate) => candidate.id === drag.nodeId);
    const box = node ? nodeBox(node) : undefined;
    setDrag(null);
    if (node && box) {
      commit({ type: "move-node", nodeId: node.id, x: box.x, y: box.y });
    }
  };

  const addNode = () => {
    commit({
      type: "add-node",
      node: {
        label: nextUntitledLabel(model),
        x: view.minX + 120,
        y: view.minY + 120
      }
    });
  };

  const autoLayout = (mode: DiagramLayoutMode = layoutMode) => {
    const laidOut = applyDiagramLayout(model, mode);
    setDraftModel(laidOut);
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
      directEditMutation.mutate(operations);
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

  return (
    <div className="flex h-full min-h-[520px] flex-col border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 p-3">
        <button className="h-9 border border-slate-300 bg-white px-3 text-sm font-medium" onClick={addNode} disabled={directEditMutation.isPending}>
          Add node
        </button>
        <button className="h-9 border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-50" onClick={removeSelected} disabled={!selectedElement || directEditMutation.isPending}>
          Delete selected
        </button>
        <button
          className="h-9 border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-50"
          disabled={!selectedNode}
          onClick={() => selectedNode && setPendingEdgeSource(selectedNode.id)}
        >
          Start edge
        </button>
        <button
          className="h-9 border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-50"
          disabled={!selectedEdge}
          onClick={() => setReconnectMode("target")}
        >
          Reconnect target
        </button>
        <button
          className="h-9 border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-50"
          disabled={!selectedEdge}
          onClick={() => setReconnectMode("source")}
        >
          Reconnect source
        </button>
        <div className="flex h-9 overflow-hidden border border-slate-300 bg-white text-sm">
          {(["hierarchical", "grid", "radial"] as const).map((mode) => (
            <button
              key={mode}
              className={`px-3 capitalize ${layoutMode === mode ? "bg-teal-700 text-white" : "text-slate-700"}`}
              onClick={() => {
                setLayoutMode(mode);
                autoLayout(mode);
              }}
              disabled={directEditMutation.isPending}
              type="button"
            >
              {mode}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {SWATCHES.map((swatch) => (
            <button
              key={swatch.label}
              className="h-7 w-7 border border-slate-300"
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

      {(pendingEdgeSourceId || reconnectMode || error || directEditMutation.isPending) && (
        <div className="border-b border-slate-200 bg-white px-3 py-2 text-sm">
          {pendingEdgeSourceId ? <span className="text-teal-700">Click a target node to create an edge from {pendingEdgeSourceId}.</span> : null}
          {reconnectMode ? <span className="text-teal-700">Click a node to reconnect the edge {reconnectMode}.</span> : null}
          {directEditMutation.isPending ? <span className="text-amber-700">Saving structured edit...</span> : null}
          {error ? <span className="text-red-700">{error}</span> : null}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <svg
          ref={svgRef}
          className="min-h-full min-w-full touch-none bg-white"
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
                <rect x={box.x} y={box.y} width={box.width} height={box.height} fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5" />
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
            return (
              <g
                key={edge.id}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  selectElement({ type: "edge", id: edge.id });
                }}
              >
                <path d={pointsToSvgPath(route.points)} fill="none" stroke={selected ? "#0f766e" : "#334155"} strokeWidth={selected ? 4 : 2} markerEnd="url(#arrow)" />
                {edge.label ? (
                  <text x={route.labelPoint.x} y={route.labelPoint.y} fill="#475569" fontSize="12">
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}

          {model.nodes.map((node) => {
            const box = nodeBox(node);
            const selected = selectedElement?.type === "node" && selectedElement.id === node.id;
            const fill = styleColor(node.style, "fillColor", node.type === "database" ? "#ecfeff" : "#fff7ed");
            const stroke = selected ? "#0f766e" : styleColor(node.style, "strokeColor", node.type === "database" ? "#0891b2" : "#ea580c");
            return (
              <g key={node.id} onPointerDown={(event) => handleNodePointerDown(event, node)}>
                <rect x={box.x} y={box.y} width={box.width} height={box.height} rx="6" fill={fill} stroke={stroke} strokeWidth={selected ? 3 : 1.5} />
                {selected ? (
                  <foreignObject x={box.x + 8} y={box.y + box.height / 2 - 16} width={box.width - 16} height="34">
                    <input
                      className="h-8 w-full border border-teal-700 bg-white px-2 text-center text-sm font-semibold outline-none"
                      value={node.label}
                      onPointerDown={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        const label = event.target.value;
                        setDraftModel((current) =>
                          current
                            ? {
                                ...current,
                                nodes: current.nodes.map((candidate) =>
                                  candidate.id === node.id ? { ...candidate, label } : candidate
                                )
                              }
                            : current
                        );
                      }}
                      onBlur={(event) => {
                        const label = event.target.value.trim();
                        if (label) {
                          commit({ type: "rename-node", nodeId: node.id, label });
                        }
                      }}
                    />
                  </foreignObject>
                ) : (
                  <text x={box.x + box.width / 2} y={box.y + box.height / 2 + 5} textAnchor="middle" fill="#111827" fontSize="14" fontWeight="600">
                    {node.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
