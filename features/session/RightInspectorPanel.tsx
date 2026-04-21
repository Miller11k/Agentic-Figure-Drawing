"use client";

import { SessionHistoryPanel } from "./SessionHistoryPanel";
import { useEditorStore } from "./store";
import type { SessionHistoryResponse } from "./types";

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-48 overflow-auto border border-slate-200 bg-slate-950 p-3 text-xs leading-5 text-slate-100">
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  );
}

export function RightInspectorPanel({ history }: { history?: SessionHistoryResponse }) {
  const { selectedVersionId, activeArtifactId } = useEditorStore();
  const selectedStep =
    history?.steps.find((step) => step.versionId === selectedVersionId) ?? history?.steps.at(-1);
  const activeArtifact =
    history?.artifacts.find((artifact) => artifact.id === activeArtifactId) ?? history?.artifacts.at(-1);
  const traces = history?.traces ?? [];

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
