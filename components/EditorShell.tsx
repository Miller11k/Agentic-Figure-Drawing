"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { LeftControlPanel } from "@/components/LeftControlPanel";
import { DiagramWorkspace } from "@/features/diagram/DiagramWorkspace";
import { ImageWorkspace } from "@/features/image/ImageWorkspace";
import { getSessionHistory } from "@/features/session/api";
import { selectVersionArtifact } from "@/features/session/artifacts";
import { RightInspectorPanel } from "@/features/session/RightInspectorPanel";
import { useEditorStore } from "@/features/session/store";

export function EditorShell() {
  const {
    mode,
    activeSessionId,
    activeArtifactId,
    activeDiagramModel,
    setActiveVersion,
    setActiveArtifact,
    setDiagramState
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
    const latestArtifact = selectVersionArtifact(history, history.currentVersionId, artifactMode) ?? history.artifacts.at(-1);

    setActiveVersion(history.currentVersionId);

    if (latestStep?.diagramModel) {
      setDiagramState(latestStep.diagramModel);
    }

    if (latestArtifact) {
      setActiveArtifact(latestArtifact.id);
    }
  }, [history, setActiveArtifact, setActiveVersion, setDiagramState]);

  return (
    <main className="grid min-h-screen grid-cols-[320px_minmax(0,1fr)_360px] bg-slate-100 text-slate-950">
      <LeftControlPanel history={history} />

      <section className="flex min-w-0 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5">
          <div>
            <p className="text-xs font-semibold uppercase text-teal-700">Workspace</p>
            <h2 className="text-lg font-semibold">{mode === "diagram" ? "Diagram canvas" : "Image editor"}</h2>
          </div>
          <div className="text-right text-sm text-slate-600">
            <p>{history?.title ?? "No session"}</p>
            <p className="text-xs">Current version: {history?.currentVersionId ?? "none"}</p>
          </div>
        </header>

        <div className="min-h-0 flex-1 p-5">
          {historyQuery.isLoading ? (
            <div className="flex h-full min-h-[520px] items-center justify-center bg-white text-slate-600">Loading session...</div>
          ) : mode === "diagram" ? (
            <DiagramWorkspace diagramModel={activeDiagramModel} />
          ) : (
            <ImageWorkspace artifactId={activeArtifactId} />
          )}
        </div>
      </section>

      <RightInspectorPanel history={history} />
    </main>
  );
}
