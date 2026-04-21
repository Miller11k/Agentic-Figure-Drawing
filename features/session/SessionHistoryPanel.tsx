"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { revertSession } from "./api";
import { useEditorStore } from "./store";
import type { SessionHistoryResponse } from "./types";

export function SessionHistoryPanel({ history }: { history?: SessionHistoryResponse }) {
  const queryClient = useQueryClient();
  const { activeSessionId, activeVersionId, selectedVersionId, selectVersion, setActiveVersion } = useEditorStore();
  const revertMutation = useMutation({
    mutationFn: (versionId: string) => revertSession(activeSessionId!, versionId),
    onSuccess: async (result) => {
      setActiveVersion(result.currentVersionId);
      await queryClient.invalidateQueries({ queryKey: ["session", activeSessionId] });
    }
  });

  if (!history) {
    return <p className="text-sm text-slate-500">No session loaded.</p>;
  }

  return (
    <div className="space-y-2">
      {history.steps.map((step, index) => {
        const isActive = step.versionId === activeVersionId;
        const isSelected = step.versionId === selectedVersionId;
        return (
          <button
            key={step.versionId}
            className={`w-full border p-3 text-left text-sm ${
              isSelected ? "border-teal-700 bg-teal-50" : isActive ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"
            }`}
            onClick={() => selectVersion(step.versionId)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-900">#{index + 1} {step.stepType}</span>
              <span className="text-xs text-slate-500">{step.mode}</span>
            </div>
            <p className="mt-1 truncate text-xs text-slate-600">{step.prompt || "No prompt"}</p>
            <p className="mt-1 text-xs text-slate-400">{new Date(step.timestamp).toLocaleTimeString()}</p>
            {!isActive ? (
              <span
                className="mt-2 inline-flex h-7 items-center border border-slate-300 px-2 text-xs font-medium text-slate-700"
                onClick={(event) => {
                  event.stopPropagation();
                  revertMutation.mutate(step.versionId);
                }}
              >
                Revert
              </span>
            ) : null}
          </button>
        );
      })}
      {revertMutation.isError ? (
        <p className="border border-red-200 bg-red-50 p-2 text-xs text-red-800">{(revertMutation.error as Error).message}</p>
      ) : null}
    </div>
  );
}
