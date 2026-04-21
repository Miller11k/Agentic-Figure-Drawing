"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { directEditDiagram } from "./api";
import { SessionHistoryPanel } from "./SessionHistoryPanel";
import { useEditorStore } from "./store";
import type { SessionHistoryResponse } from "./types";
import type { DirectDiagramEditOperation } from "@/types";

const STYLE_SWATCHES = [
  { label: "Blue", fill: "#eff6ff", stroke: "#2563eb" },
  { label: "Green", fill: "#ecfdf5", stroke: "#059669" },
  { label: "Amber", fill: "#fffbeb", stroke: "#d97706" },
  { label: "Gray", fill: "#f8fafc", stroke: "#475569" },
  { label: "Teal", fill: "#f0fdfa", stroke: "#0f766e" }
];

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-48 overflow-auto border border-slate-200 bg-slate-950 p-3 text-xs leading-5 text-slate-100">
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  );
}

export function RightInspectorPanel({ history }: { history?: SessionHistoryResponse }) {
  const queryClient = useQueryClient();
  const {
    selectedVersionId,
    activeArtifactId,
    activeDiagramModel,
    activeSessionId,
    activeVersionId,
    selectedElement,
    setActiveArtifact,
    setActiveVersion,
    setDiagramState,
    selectElement
  } = useEditorStore();
  const [groupLabel, setGroupLabel] = useState("");
  const selectedStep =
    history?.steps.find((step) => step.versionId === selectedVersionId) ?? history?.steps.at(-1);
  const activeArtifact =
    history?.artifacts.find((artifact) => artifact.id === activeArtifactId) ?? history?.artifacts.at(-1);
  const traces = history?.traces ?? [];
  const selectedElementData =
    selectedElement?.type === "node"
      ? activeDiagramModel?.nodes.find((node) => node.id === selectedElement.id)
      : selectedElement?.type === "edge"
        ? activeDiagramModel?.edges.find((edge) => edge.id === selectedElement.id)
        : selectedElement?.type === "group"
          ? activeDiagramModel?.groups.find((group) => group.id === selectedElement.id)
          : undefined;
  const groups = activeDiagramModel?.groups ?? [];
  const selectedNode =
    selectedElement?.type === "node" ? activeDiagramModel?.nodes.find((node) => node.id === selectedElement.id) : undefined;
  const selectedEdge =
    selectedElement?.type === "edge" ? activeDiagramModel?.edges.find((edge) => edge.id === selectedElement.id) : undefined;
  const selectedGroup =
    selectedElement?.type === "group" ? activeDiagramModel?.groups.find((group) => group.id === selectedElement.id) : undefined;
  const defaultGroupLabel = useMemo(
    () => selectedGroup?.label ?? (selectedNode ? `${selectedNode.label} group` : "New group"),
    [selectedGroup, selectedNode]
  );

  useEffect(() => {
    setGroupLabel(defaultGroupLabel);
  }, [defaultGroupLabel]);

  const directEditMutation = useMutation({
    mutationFn: async (operations: DirectDiagramEditOperation[]) => {
      if (!activeSessionId) throw new Error("Create a session before editing.");
      if (!activeDiagramModel) throw new Error("No diagram model is active.");
      return directEditDiagram(activeSessionId, activeDiagramModel, operations, activeVersionId);
    },
    onSuccess: async (result) => {
      setActiveVersion(result.versionId);
      setActiveArtifact(result.artifactId);
      setDiagramState(result.diagramModel, result.xml);
      await queryClient.invalidateQueries({ queryKey: ["session", activeSessionId] });
    }
  });

  const commit = (operation: DirectDiagramEditOperation) => directEditMutation.mutate([operation]);

  const applyNodeStyle = (nodeId: string, fill: string, stroke: string) =>
    commit({
      type: "update-node-style",
      nodeId,
      style: {
        fillColor: fill,
        strokeColor: stroke,
        raw: `rounded=1;whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${stroke};`
      }
    });

  const applyGroupStyle = (groupId: string, fill: string, stroke: string) =>
    commit({
      type: "update-group",
      groupId,
      style: {
        fillColor: fill,
        strokeColor: stroke,
        raw: `swimlane;whiteSpace=wrap;html=1;collapsible=1;fillColor=${fill};strokeColor=${stroke};`
      }
    });

  const applyEdgeStyle = (edgeId: string, stroke: string) =>
    commit({
      type: "update-edge-style",
      edgeId,
      style: {
        strokeColor: stroke,
        raw: `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=${stroke};`
      }
    });

  return (
    <aside className="flex h-full flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-white p-4">
      <section>
        <h2 className="text-sm font-semibold uppercase text-slate-500">Session history</h2>
        <div className="mt-3">
          <SessionHistoryPanel history={history} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase text-slate-500">Active artifact</h2>
        <div className="mt-3 border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p>ID: {activeArtifact?.id ?? "none"}</p>
          <p>Type: {activeArtifact?.type ?? "none"}</p>
          <p>MIME: {activeArtifact?.mimeType ?? "none"}</p>
          <p>Bytes: {activeArtifact?.bytes ?? "unknown"}</p>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase text-slate-500">Selected element</h2>
        <div className="mt-3 space-y-3">
          <JsonBlock value={selectedElementData ?? selectedElement ?? null} />
          {selectedNode ? (
            <div className="space-y-3 border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Node style</p>
              <div className="flex flex-wrap gap-2">
                {STYLE_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.label}
                    className="h-8 w-8 border border-slate-300"
                    style={{ background: swatch.fill }}
                    title={swatch.label}
                    onClick={() => applyNodeStyle(selectedNode.id, swatch.fill, swatch.stroke)}
                    type="button"
                  />
                ))}
              </div>
              <label className="block text-xs font-semibold uppercase text-slate-500">
                Group
                <select
                  className="mt-1 h-9 w-full border border-slate-300 bg-white px-2 text-sm normal-case text-slate-800"
                  value={selectedNode.groupId ?? ""}
                  onChange={(event) =>
                    commit({ type: "set-node-group", nodeId: selectedNode.id, groupId: event.target.value || undefined })
                  }
                >
                  <option value="">No group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.label || group.id}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <input
                  className="h-9 min-w-0 flex-1 border border-slate-300 px-2 text-sm"
                  value={groupLabel}
                  onChange={(event) => setGroupLabel(event.target.value)}
                />
                <button
                  className="h-9 border border-teal-700 bg-teal-700 px-3 text-sm font-medium text-white"
                  onClick={() =>
                    commit({
                      type: "add-group",
                      group: { label: groupLabel.trim() || `${selectedNode.label} group`, nodeIds: [selectedNode.id] }
                    })
                  }
                  type="button"
                >
                  Group
                </button>
              </div>
            </div>
          ) : null}
          {selectedEdge ? (
            <div className="space-y-3 border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Edge style</p>
              <div className="flex flex-wrap gap-2">
                {STYLE_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.label}
                    className="h-8 w-8 border border-slate-300"
                    style={{ background: swatch.stroke }}
                    title={swatch.label}
                    onClick={() => applyEdgeStyle(selectedEdge.id, swatch.stroke)}
                    type="button"
                  />
                ))}
              </div>
            </div>
          ) : null}
          {selectedGroup ? (
            <div className="space-y-3 border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Group controls</p>
              <div className="flex gap-2">
                <input
                  className="h-9 min-w-0 flex-1 border border-slate-300 px-2 text-sm"
                  value={groupLabel}
                  onChange={(event) => setGroupLabel(event.target.value)}
                />
                <button
                  className="h-9 border border-slate-300 bg-white px-3 text-sm font-medium"
                  onClick={() => commit({ type: "update-group", groupId: selectedGroup.id, label: groupLabel })}
                  type="button"
                >
                  Rename
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {STYLE_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.label}
                    className="h-8 w-8 border border-slate-300"
                    style={{ background: swatch.fill }}
                    title={swatch.label}
                    onClick={() => applyGroupStyle(selectedGroup.id, swatch.fill, swatch.stroke)}
                    type="button"
                  />
                ))}
              </div>
              <button
                className="h-9 w-full border border-red-200 bg-white px-3 text-sm font-medium text-red-700"
                onClick={() => {
                  commit({ type: "delete-group", groupId: selectedGroup.id, ungroupNodes: true });
                  selectElement(undefined);
                }}
                type="button"
              >
                Ungroup and delete
              </button>
            </div>
          ) : null}
          {directEditMutation.isPending ? <p className="text-sm text-amber-700">Saving inspector edit...</p> : null}
          {directEditMutation.error ? <p className="text-sm text-red-700">{directEditMutation.error.message}</p> : null}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase text-slate-500">Parsed intent</h2>
        <div className="mt-3">
          <JsonBlock value={selectedStep?.parsedIntent} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase text-slate-500">Execution summary</h2>
        <div className="mt-3">
          <JsonBlock
            value={{
              versionId: selectedStep?.versionId,
              stepType: selectedStep?.stepType,
              artifactPointers: selectedStep?.artifactPointers,
              editingAnalysis: selectedStep?.editingAnalysis
            }}
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase text-slate-500">Trace debug</h2>
        <div className="mt-3 space-y-2">
          {traces.length === 0 ? <p className="text-sm text-slate-500">No traces recorded yet.</p> : null}
          {traces.slice().reverse().map((trace) => (
            <div key={trace.id} className="border border-slate-200 bg-white p-3 text-xs text-slate-700">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{trace.stageName}</span>
                <span className={trace.status === "success" ? "text-teal-700" : "text-red-700"}>{trace.status}</span>
              </div>
              <p className="mt-1 text-slate-500">{trace.pipelineName}</p>
              <p className="mt-1">Model: {trace.modelUsed ?? "local"}</p>
              <p className="mt-1">Latency: {trace.latencyMs ?? "-"}ms</p>
              {trace.outputSummary ? <p className="mt-2 line-clamp-3 text-slate-600">{trace.outputSummary}</p> : null}
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
