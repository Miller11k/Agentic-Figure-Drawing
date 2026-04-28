"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSession, revertSession } from "./api";
import { selectVersionArtifact } from "./artifacts";
import { useEditorStore } from "./store";
import type { SessionHistoryResponse } from "./types";
import { Pill } from "@/components/ui";

export function SessionHistoryPanel({ history }: { history?: SessionHistoryResponse }) {
  const queryClient = useQueryClient();
  const {
    activeSessionId,
    activeVersionId,
    selectedVersionId,
    mode,
    selectVersion,
    setMode,
    setActiveSession,
    setActiveVersion,
    setActiveArtifact,
    setDiagramState,
    setActiveImageDataUrl,
    setPrompt
  } = useEditorStore();

  const restoreVersion = (versionId: string) => {
    if (!history) return;
    const step = history.steps.find((candidate) => candidate.versionId === versionId);
    if (!step) return;
    const artifact = selectVersionArtifact(history, versionId, step.mode);

    selectVersion(versionId);
    setMode(step.mode);
    setActiveVersion(versionId);
    setActiveArtifact(artifact?.id);
    setPrompt(step.prompt ?? "");

    if (step.mode === "diagram") {
      setDiagramState(step.diagramModel ?? undefined, undefined);
      setActiveImageDataUrl(undefined);
    } else {
      setDiagramState(undefined, undefined);
      setActiveImageDataUrl(undefined);
    }
  };

  const revertMutation = useMutation({
    mutationFn: (versionId: string) => revertSession(activeSessionId!, versionId),
    onSuccess: async (result) => {
      setActiveVersion(result.currentVersionId);
      await queryClient.invalidateQueries({ queryKey: ["session", activeSessionId] });
    }
  });
  const resetHistoryMutation = useMutation({
    mutationFn: () => createSession("Editing session", mode),
    onSuccess: async (result) => {
      setActiveSession(result.session.id, result.initialVersion.id);
      setActiveVersion(result.initialVersion.id);
      setActiveArtifact(undefined);
      setDiagramState(undefined, undefined);
      setActiveImageDataUrl(undefined);
      setPrompt("");
      await queryClient.invalidateQueries({ queryKey: ["session", result.session.id] });
    }
  });

  if (!history) {
    return <p className="rounded-3xl border border-slate-200/70 bg-white/70 p-4 text-sm text-slate-500">No session loaded.</p>;
  }

  const visibleSteps = history.steps.slice().reverse();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{history.steps.length} version{history.steps.length === 1 ? "" : "s"}</span>
        <button
          className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 font-semibold text-slate-600 shadow-sm transition hover:bg-white disabled:opacity-40"
          disabled={resetHistoryMutation.isPending}
          onClick={() => resetHistoryMutation.mutate()}
          type="button"
        >
          Reset history
        </button>
      </div>
      {visibleSteps.map((step) => {
        const index = history.steps.findIndex((candidate) => candidate.versionId === step.versionId);
        const isActive = step.versionId === activeVersionId;
        const isSelected = step.versionId === selectedVersionId;
        return (
          <div
            key={step.versionId}
            role="button"
            tabIndex={0}
            className={`w-full rounded-3xl border p-4 text-left text-sm shadow-sm transition hover:-translate-y-0.5 ${
              isSelected
                ? "border-slate-900 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.10)]"
                : isActive
                  ? "border-blue-200 bg-blue-50/70"
                  : "border-slate-200/70 bg-white/68 hover:bg-white"
            }`}
            onClick={() => restoreVersion(step.versionId)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                restoreVersion(step.versionId);
              }
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="font-semibold tracking-tight text-slate-900">#{index + 1} {step.stepType}</span>
                <p className="mt-1 truncate text-xs text-slate-500">{new Date(step.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {isActive ? <Pill className="border-blue-200 bg-blue-50 text-blue-700">Current</Pill> : null}
                <Pill>{step.mode}</Pill>
              </div>
            </div>
            {step.prompt ? <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-600">{step.prompt}</p> : null}
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="truncate font-mono text-[10px] text-slate-400">{step.versionId}</span>
              {!isActive ? (
                <button
                  className="inline-flex h-8 shrink-0 items-center rounded-full border border-slate-200 bg-white/70 px-3 text-xs font-semibold text-slate-700"
                  onClick={(event) => {
                    event.stopPropagation();
                    restoreVersion(step.versionId);
                    revertMutation.mutate(step.versionId);
                  }}
                  type="button"
                >
                  Reopen
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
      {revertMutation.isError ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">{(revertMutation.error as Error).message}</p>
      ) : null}
    </div>
  );
}
