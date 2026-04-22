"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { LeftControlPanel } from "@/components/LeftControlPanel";
import { Panel, Pill, SkeletonPanel } from "@/components/ui";
import { DiagramWorkspace } from "@/features/diagram/DiagramWorkspace";
import { ImageWorkspace } from "@/features/image/ImageWorkspace";
import { getSessionHistory } from "@/features/session/api";
import { selectVersionArtifact } from "@/features/session/artifacts";
import { SessionHistoryPanel } from "@/features/session/SessionHistoryPanel";
import { useEditorStore } from "@/features/session/store";

export function EditorShell() {
  const {
    mode,
    activeSessionId,
    activeArtifactId,
    activeDiagramModel,
    showHistory,
    setShowHistory,
    setMode,
    setActiveVersion,
    setActiveArtifact,
    setDiagramState,
    setActiveImageDataUrl
  } = useEditorStore();

  const historyQuery = useQuery({
    queryKey: ["session", activeSessionId],
    queryFn: () => getSessionHistory(activeSessionId!),
    enabled: Boolean(activeSessionId)
  });
  const history = historyQuery.data;

  useEffect(() => {
    if (!history?.currentVersionId) {
      return;
    }

    const latestStep = history.steps.find((step) => step.versionId === history.currentVersionId);
    const artifactMode = latestStep?.mode ?? mode;
    const latestArtifact =
      selectVersionArtifact(history, history.currentVersionId, artifactMode) ?? history.artifacts.at(-1);

    setActiveVersion(history.currentVersionId);
    setMode(artifactMode);

    if (latestStep?.diagramModel) {
      setDiagramState(latestStep.diagramModel);
      setActiveImageDataUrl(undefined);
    } else if (artifactMode === "image") {
      setDiagramState(undefined, undefined);
      setActiveImageDataUrl(undefined);
    }

    if (latestArtifact) {
      setActiveArtifact(latestArtifact.id);
    } else {
      setActiveArtifact(undefined);
    }
  }, [history, mode, setActiveArtifact, setActiveImageDataUrl, setActiveVersion, setDiagramState, setMode]);

  return (
    <main className="min-h-screen overflow-hidden p-4 text-slate-950 lg:p-6">
      <div
        className={`mx-auto grid h-[calc(100vh-2rem)] max-w-[1800px] grid-cols-1 gap-4 lg:h-[calc(100vh-3rem)] ${
          showHistory ? "lg:grid-cols-[340px_minmax(0,1fr)_330px]" : "lg:grid-cols-[340px_minmax(0,1fr)]"
        }`}
      >
        <LeftControlPanel history={history} />

        <Panel className="flex min-w-0 flex-col overflow-hidden">
          <header className="flex items-center justify-between gap-4 border-b border-white/70 px-6 py-5">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Pill>{mode === "diagram" ? "Diagram mode" : "Image mode"}</Pill>
                {activeSessionId ? <Pill>Ready</Pill> : <Pill>New</Pill>}
              </div>
              <h2 className="truncate text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                {mode === "diagram" ? "Diagram canvas" : "Image editor"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{history?.title ?? "Create a session to begin"}</p>
            </div>
            <div className="hidden min-w-0 text-right text-sm text-slate-500 md:block">
              <button
                className="rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white"
                onClick={() => setShowHistory(!showHistory)}
                type="button"
              >
                {showHistory ? "Hide history" : "Show history"}
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 p-4 lg:p-5">
            {historyQuery.isLoading ? (
              <SkeletonPanel />
            ) : mode === "diagram" ? (
              <DiagramWorkspace diagramModel={activeDiagramModel} history={history} />
            ) : (
              <ImageWorkspace artifactId={activeArtifactId} />
            )}
          </div>
        </Panel>

        {showHistory ? (
          <Panel className="flex min-h-0 flex-col overflow-y-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Timeline</p>
                <h2 className="text-sm font-semibold tracking-tight text-slate-950">History</h2>
              </div>
              <button
                className="rounded-full px-3 py-1 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setShowHistory(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <SessionHistoryPanel history={history} />
          </Panel>
        ) : null}
      </div>
    </main>
  );
}
