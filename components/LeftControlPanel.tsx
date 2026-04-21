"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  artifactDownloadUrl,
  createSession,
  editDiagram,
  editImage,
  generateDiagram,
  generateImage,
  importDiagram
} from "@/features/session/api";
import { useEditorStore } from "@/features/session/store";
import type { SessionHistoryResponse } from "@/features/session/types";
import type { EditorMode } from "@/types";

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File) {
  return file.text();
}

export function LeftControlPanel({ history }: { history?: SessionHistoryResponse }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    mode,
    prompt,
    activeSessionId,
    activeVersionId,
    activeArtifactId,
    activeDiagramModel,
    activeXml,
    setMode,
    setPrompt,
    setActiveSession,
    setActiveVersion,
    setActiveArtifact,
    setDiagramState
  } = useEditorStore();

  const invalidate = async (sessionId?: string) => {
    if (sessionId) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["session", sessionId] }),
        queryClient.invalidateQueries({ queryKey: ["traces", sessionId] })
      ]);
    }
  };

  const createSessionMutation = useMutation({
    mutationFn: () => createSession("Editing session", mode),
    onSuccess: (result) => {
      setError(null);
      setActiveSession(result.session.id, result.initialVersion.id);
    },
    onError: (err) => setError((err as Error).message)
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) =>
      importDiagram(activeSessionId!, await readFileAsText(file), file.name, activeVersionId),
    onSuccess: async (result) => {
      setError(null);
      setMode("diagram");
      setActiveVersion(result.versionId);
      setActiveArtifact(result.artifactId);
      setDiagramState(result.diagramModel, result.xml);
      await invalidate(activeSessionId);
    },
    onError: (err) => setError((err as Error).message)
  });

  const promptMutation = useMutation({
    mutationFn: async () => {
      if (!activeSessionId) throw new Error("Create a session before running a workflow.");
      if (!prompt.trim()) throw new Error("Enter a prompt first.");

      if (mode === "diagram") {
        if (activeDiagramModel && activeXml) {
          return editDiagram(activeSessionId, prompt, activeDiagramModel, activeXml, activeVersionId);
        }
        return generateDiagram(activeSessionId, prompt, activeVersionId);
      }

      return generateImage(activeSessionId, prompt, activeVersionId);
    },
    onSuccess: async (result) => {
      setError(null);
      setActiveVersion(result.versionId);
      setActiveArtifact(result.artifactId);
      if ("diagramModel" in result) {
        setDiagramState(result.diagramModel, result.xml);
      }
      await invalidate(activeSessionId);
    },
    onError: (err) => setError((err as Error).message)
  });

  const imageEditMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!activeSessionId) throw new Error("Create a session before editing an image.");
      if (!prompt.trim()) throw new Error("Enter an image edit prompt first.");
      return editImage(activeSessionId, prompt, await readFileAsDataUrl(file), undefined, activeVersionId);
    },
    onSuccess: async (result) => {
      setError(null);
      setMode("image");
      setActiveVersion(result.versionId);
      setActiveArtifact(result.artifactId);
      await invalidate(activeSessionId);
    },
    onError: (err) => setError((err as Error).message)
  });

  const busy =
    createSessionMutation.isPending ||
    importMutation.isPending ||
    promptMutation.isPending ||
    imageEditMutation.isPending;

  const latestArtifact = history?.artifacts.at(-1);
  const downloadId = activeArtifactId ?? latestArtifact?.id;

  return (
    <aside className="flex h-full flex-col gap-4 border-r border-slate-200 bg-white p-4">
      <div>
        <p className="text-xs font-semibold uppercase text-teal-700">OpenAI-native editor</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-950">Stateful workspace</h1>
      </div>

      <button
        className="h-10 border border-slate-900 bg-slate-950 px-3 text-sm font-medium text-white disabled:opacity-50"
        onClick={() => createSessionMutation.mutate()}
        disabled={busy}
      >
        New session
      </button>

      <div className="grid grid-cols-2 border border-slate-300">
        {(["diagram", "image"] as EditorMode[]).map((item) => (
          <button
            key={item}
            className={`h-9 text-sm font-medium ${mode === item ? "bg-teal-700 text-white" : "bg-white text-slate-700"}`}
            onClick={() => setMode(item)}
          >
            {item === "diagram" ? "Diagram" : "Image"}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-800" htmlFor="prompt">
          Prompt
        </label>
        <textarea
          id="prompt"
          className="h-32 w-full resize-none border border-slate-300 p-3 text-sm outline-none focus:border-teal-700"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={mode === "diagram" ? "Add a database below the backend" : "Generate a crisp product mockup"}
        />
      </div>

      <div className="grid gap-2">
        <button
          className="h-10 border border-teal-700 bg-teal-700 px-3 text-sm font-medium text-white disabled:opacity-50"
          disabled={!activeSessionId || busy}
          onClick={() => promptMutation.mutate()}
        >
          {mode === "diagram" && activeDiagramModel ? "Edit diagram" : mode === "diagram" ? "Generate diagram" : "Generate image"}
        </button>
        <button
          className="h-10 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 disabled:opacity-50"
          disabled={!activeSessionId || busy}
          onClick={() => fileInputRef.current?.click()}
        >
          Import Draw.io XML
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".drawio,.xml"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) importMutation.mutate(file);
            event.currentTarget.value = "";
          }}
        />
        <button
          className="h-10 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 disabled:opacity-50"
          disabled={!activeSessionId || busy}
          onClick={() => imageInputRef.current?.click()}
        >
          Edit uploaded image
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) imageEditMutation.mutate(file);
            event.currentTarget.value = "";
          }}
        />
      </div>

      {downloadId ? (
        <a
          className="flex h-10 items-center justify-center border border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-800"
          href={artifactDownloadUrl(downloadId)}
        >
          Download active artifact
        </a>
      ) : null}

      <div className="mt-auto border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
        <p>Session: {activeSessionId ?? "none"}</p>
        <p>Version: {activeVersionId ?? "none"}</p>
        <p>Mode: {mode}</p>
      </div>

      {busy ? <div className="border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Workflow running...</div> : null}
      {error ? <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
    </aside>
  );
}
