"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { directEditDiagram } from "./api";
import { SessionHistoryPanel } from "./SessionHistoryPanel";
import { useEditorStore } from "./store";
import type { SessionHistoryResponse } from "./types";
import type { DirectDiagramEditOperation } from "@/types";
import { Button, FieldLabel, Panel, Section, SectionTitle } from "@/components/ui";

const STYLE_SWATCHES = [
  { label: "Blue", fill: "#eff6ff", stroke: "#2563eb" },
  { label: "Green", fill: "#ecfdf5", stroke: "#059669" },
  { label: "Amber", fill: "#fffbeb", stroke: "#d97706" },
  { label: "Gray", fill: "#f8fafc", stroke: "#475569" },
  { label: "Teal", fill: "#f0fdfa", stroke: "#0f766e" }
];

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-48 overflow-auto rounded-3xl border border-slate-800/70 bg-slate-950/95 p-4 text-xs leading-5 text-slate-100 shadow-inner">
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
    <Panel className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
      <Section>
        <SectionTitle eyebrow="Timeline" title="Session history" />
        <div className="mt-3">
          <SessionHistoryPanel history={history} />
        </div>
      </Section>

      <Section>
        <SectionTitle eyebrow="Artifact" title="Active output" />
        <div className="mt-3 space-y-2 rounded-3xl border border-slate-200/70 bg-slate-50/70 p-4 text-sm text-slate-600">
          <p className="truncate">ID: <span className="font-mono text-xs text-slate-800">{activeArtifact?.id ?? "none"}</span></p>
          <p>Type: <span className="font-medium text-slate-800">{activeArtifact?.type ?? "none"}</span></p>
          <p>MIME: {activeArtifact?.mimeType ?? "none"}</p>
          <p>Bytes: {activeArtifact?.bytes ?? "unknown"}</p>
        </div>
      </Section>

      <Section>
        <SectionTitle eyebrow="Inspector" title="Selected element" />
        <div className="mt-3 space-y-3">
          <JsonBlock value={selectedElementData ?? selectedElement ?? null} />
          {selectedNode ? (
            <div className="space-y-3 rounded-3xl border border-slate-200/70 bg-white/70 p-4">
              <FieldLabel>Node style</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {STYLE_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.label}
                    className="h-8 w-8 rounded-full border border-white shadow-sm ring-1 ring-slate-200 transition hover:scale-105"
                    style={{ background: swatch.fill }}
                    title={swatch.label}
                    onClick={() => applyNodeStyle(selectedNode.id, swatch.fill, swatch.stroke)}
                    type="button"
                  />
                ))}
              </div>
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Group
                <select
                  className="mt-2 h-10 w-full rounded-2xl border border-slate-200 bg-white/80 px-3 text-sm normal-case text-slate-800 outline-none"
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
                  className="h-10 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white/80 px-3 text-sm outline-none"
                  value={groupLabel}
                  onChange={(event) => setGroupLabel(event.target.value)}
                />
                <Button
                  variant="primary"
                  onClick={() =>
                    commit({
                      type: "add-group",
                      group: { label: groupLabel.trim() || `${selectedNode.label} group`, nodeIds: [selectedNode.id] }
                    })
                  }
                  type="button"
                >
                  Group
                </Button>
              </div>
            </div>
          ) : null}
          {selectedEdge ? (
            <div className="space-y-3 rounded-3xl border border-slate-200/70 bg-white/70 p-4">
              <FieldLabel>Edge style</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {STYLE_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.label}
                    className="h-8 w-8 rounded-full border border-white shadow-sm ring-1 ring-slate-200 transition hover:scale-105"
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
            <div className="space-y-3 rounded-3xl border border-slate-200/70 bg-white/70 p-4">
              <FieldLabel>Group controls</FieldLabel>
              <div className="flex gap-2">
                <input
                  className="h-10 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white/80 px-3 text-sm outline-none"
                  value={groupLabel}
                  onChange={(event) => setGroupLabel(event.target.value)}
                />
                <Button
                  onClick={() => commit({ type: "update-group", groupId: selectedGroup.id, label: groupLabel })}
                  type="button"
                >
                  Rename
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {STYLE_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.label}
                    className="h-8 w-8 rounded-full border border-white shadow-sm ring-1 ring-slate-200 transition hover:scale-105"
                    style={{ background: swatch.fill }}
                    title={swatch.label}
                    onClick={() => applyGroupStyle(selectedGroup.id, swatch.fill, swatch.stroke)}
                    type="button"
                  />
                ))}
              </div>
              <Button
                variant="danger"
                className="w-full"
                onClick={() => {
                  commit({ type: "delete-group", groupId: selectedGroup.id, ungroupNodes: true });
                  selectElement(undefined);
                }}
                type="button"
              >
                Ungroup and delete
              </Button>
            </div>
          ) : null}
          {directEditMutation.isPending ? <p className="text-sm text-amber-700">Saving inspector edit...</p> : null}
          {directEditMutation.error ? <p className="text-sm text-red-700">{directEditMutation.error.message}</p> : null}
        </div>
      </Section>

      <Section>
        <SectionTitle eyebrow="OpenAI" title="Parsed intent" />
        <div className="mt-3">
          <JsonBlock value={selectedStep?.parsedIntent} />
        </div>
      </Section>

      <Section>
        <SectionTitle eyebrow="Version" title="Execution summary" />
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
      </Section>

      <Section>
        <SectionTitle eyebrow="Observability" title="Trace debug" />
        <div className="mt-3 space-y-2">
          {traces.length === 0 ? <p className="text-sm text-slate-500">No traces recorded yet.</p> : null}
          {traces.slice().reverse().map((trace) => (
            <div key={trace.id} className="rounded-3xl border border-slate-200/70 bg-white/74 p-4 text-xs text-slate-700 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{trace.stageName}</span>
                <span className={trace.status === "success" ? "text-emerald-600" : "text-red-600"}>{trace.status}</span>
              </div>
              <p className="mt-1 text-slate-500">{trace.pipelineName}</p>
              <p className="mt-1">Model: {trace.modelUsed ?? "local"}</p>
              <p className="mt-1">Latency: {trace.latencyMs ?? "-"}ms</p>
              {trace.outputSummary ? <p className="mt-2 line-clamp-3 text-slate-600">{trace.outputSummary}</p> : null}
            </div>
          ))}
        </div>
      </Section>
    </Panel>
  );
}
