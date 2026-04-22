"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  createSession,
  editDiagram,
  generateDiagram,
  generateImage,
  importDiagram
} from "@/features/session/api";
import { useEditorStore } from "@/features/session/store";
import type { SessionHistoryResponse } from "@/features/session/types";
import type { EditorMode } from "@/types";
import type { ImageGenerationProvider } from "@/lib/google";
import { createDiagramSvgFromModel } from "@/lib/diagram/svg";
import { createDrawioXmlFromModel } from "@/lib/xml";
import { Button, Panel, Pill, Section, SectionTitle, SegmentedControl, TextArea } from "@/components/ui";

function readFileAsText(file: File) {
  return file.text();
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function downloadText(fileName: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function LeftControlPanel({ history }: { history?: SessionHistoryResponse }) {
  const queryClient = useQueryClient();
  const diagramFileInputRef = useRef<HTMLInputElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    mode,
    prompt,
    imageProvider,
    activeSessionId,
    activeVersionId,
    activeDiagramModel,
    activeImageDataUrl,
    setMode,
    setPrompt,
    setActiveSession,
    setActiveVersion,
    setActiveArtifact,
    setDiagramState,
    setActiveImageDataUrl,
    setImageProvider,
    showHistory,
    setShowHistory,
    clearWorkspace
  } = useEditorStore();

  const invalidate = (sessionId?: string) => {
    if (sessionId) {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["session", sessionId] }),
        queryClient.invalidateQueries({ queryKey: ["traces", sessionId] })
      ]);
    }
  };

  const ensureSession = async () => {
    if (activeSessionId) {
      return { sessionId: activeSessionId, versionId: activeVersionId };
    }

    const result = await createSession("Editing session", mode);
    setActiveSession(result.session.id, result.initialVersion.id);
    return { sessionId: result.session.id, versionId: result.initialVersion.id };
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
    mutationFn: async (input: { content: string; fileName: string }) => {
      const session = await ensureSession();
      return importDiagram(session.sessionId, input.content, input.fileName, session.versionId);
    },
    onSuccess: (result) => {
      setError(null);
      setMode("diagram");
      setActiveVersion(result.versionId);
      setActiveArtifact(result.artifactId);
      setDiagramState(result.diagramModel, result.xml);
      invalidate(activeSessionId);
    },
    onError: (err) => setError((err as Error).message)
  });

  const imageDownloadId = history?.artifacts.filter((artifact) => artifact.type === "image").at(-1)?.id;
  const currentDiagramXml = activeDiagramModel ? createDrawioXmlFromModel(activeDiagramModel) : undefined;

  const generateDiagramMutation = useMutation({
    mutationFn: async () => {
      if (!prompt.trim()) throw new Error("Enter a prompt first.");
      const session = await ensureSession();
      return generateDiagram(session.sessionId, prompt, session.versionId, imageProvider);
    },
    onSuccess: (result) => {
      setError(null);
      setMode("diagram");
      setActiveVersion(result.versionId);
      setActiveArtifact(result.artifactId);
      setDiagramState(result.diagramModel, result.xml);
      invalidate(activeSessionId);
    },
    onError: (err) => setError((err as Error).message)
  });

  const editDiagramMutation = useMutation({
    mutationFn: async () => {
      if (!activeDiagramModel || !currentDiagramXml) throw new Error("Load or generate a diagram before editing it.");
      if (!prompt.trim()) throw new Error("Enter an edit prompt first.");
      const session = await ensureSession();
      return editDiagram(session.sessionId, prompt, activeDiagramModel, currentDiagramXml, session.versionId);
    },
    onSuccess: (result) => {
      setError(null);
      setMode("diagram");
      setActiveVersion(result.versionId);
      setActiveArtifact(result.artifactId);
      setDiagramState(result.diagramModel, result.xml);
      invalidate(activeSessionId);
    },
    onError: (err) => setError((err as Error).message)
  });

  const generateImageMutation = useMutation({
    mutationFn: async () => {
      if (!prompt.trim()) throw new Error("Enter a prompt first.");
      const session = await ensureSession();
      return generateImage(session.sessionId, prompt, session.versionId, imageProvider);
    },
    onSuccess: (result) => {
      setError(null);
      setMode("image");
      setActiveVersion(result.versionId);
      setActiveArtifact(result.artifactId);
      setDiagramState(undefined, undefined);
      setActiveImageDataUrl(undefined);
      invalidate(activeSessionId);
    },
    onError: (err) => setError((err as Error).message)
  });

  const triggerImageEdit = async () => {
    if (!activeImageDataUrl && !imageDownloadId) {
      setError("Upload or generate an image before editing it.");
      return;
    }
    if (!prompt.trim()) {
      setError("Enter an image edit prompt first.");
      return;
    }
    await ensureSession();
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("editor:apply-image-edit")), 0);
  };

  const hasActiveContent = Boolean(activeDiagramModel || activeImageDataUrl || imageDownloadId || activeSessionId);
  const busy =
    createSessionMutation.isPending ||
    importMutation.isPending ||
    generateDiagramMutation.isPending ||
    editDiagramMutation.isPending ||
    generateImageMutation.isPending;

  return (
    <Panel className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
      <div className="rounded-[24px] bg-slate-950 p-5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.20)]">
        <div className="mb-7 flex items-center justify-between">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/12 text-lg">✦</span>
          <Pill className="border-white/15 bg-white/10 text-white/80">{mode}</Pill>
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/48">OpenAI-native editor</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">Stateful workspace</h1>
      </div>

      <Button variant="primary" onClick={clearWorkspace} disabled={busy || !hasActiveContent}>
        Clear workspace
      </Button>

      <SegmentedControl<EditorMode>
        value={mode}
        onChange={setMode}
        options={[
          { value: "diagram", label: "Diagram" },
          { value: "image", label: "Image" }
        ]}
      />

      <Button className="w-full" variant="secondary" onClick={() => setShowHistory(!showHistory)}>
        {showHistory ? "Hide history" : "Show history"}
      </Button>

      {mode === "diagram" ? (
        <>
          <Section className="space-y-3">
            <SectionTitle eyebrow="Intent" title="Prompt" />
            <TextArea
              className="h-36"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the diagram you want, or how the current diagram should change."
            />
            <div className="grid grid-cols-1 gap-2">
              <Button variant="primary" className="w-full" disabled={busy} onClick={() => generateDiagramMutation.mutate()}>
                Generate new diagram
              </Button>
              <Button className="w-full" disabled={!activeDiagramModel || busy} onClick={() => editDiagramMutation.mutate()}>
                Edit current diagram
              </Button>
            </div>
          </Section>

          <Section className="space-y-3">
            <SectionTitle eyebrow="Import" title="Draw.io / Mermaid" />
            <Button className="w-full" disabled={busy} onClick={() => diagramFileInputRef.current?.click()}>
              Import file
            </Button>
            <input
              ref={diagramFileInputRef}
              type="file"
              accept=".drawio,.xml,.mmd,.mermaid,.md"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) importMutation.mutate({ content: await readFileAsText(file), fileName: file.name });
                event.currentTarget.value = "";
              }}
            />
          </Section>

          <Section className="space-y-3">
            <SectionTitle eyebrow="Export" title="Download formats" />
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={!currentDiagramXml} onClick={() => currentDiagramXml && downloadText("diagram.drawio", "application/xml", currentDiagramXml)}>
                Draw.io
              </Button>
              <Button disabled={!currentDiagramXml} onClick={() => currentDiagramXml && downloadText("diagram.xml", "application/xml", currentDiagramXml)}>
                XML
              </Button>
              <Button disabled={!activeDiagramModel} onClick={() => activeDiagramModel && downloadText("diagram-model.json", "application/json", JSON.stringify(activeDiagramModel, null, 2))}>
                JSON
              </Button>
              <Button disabled={!activeDiagramModel} onClick={() => activeDiagramModel && downloadText("diagram.svg", "image/svg+xml", createDiagramSvgFromModel(activeDiagramModel))}>
                SVG
              </Button>
            </div>
          </Section>
        </>
      ) : (
        <>
          <Section className="space-y-3">
            <SectionTitle eyebrow="Image model" title="Generation provider" />
            <SegmentedControl<ImageGenerationProvider>
              value={imageProvider}
              onChange={setImageProvider}
              options={[
                { value: "gemini", label: "Nano Banana 2" },
                { value: "openai", label: "OpenAI" }
              ]}
            />
          </Section>

          <Section className="space-y-3">
            <SectionTitle eyebrow="Intent" title="Prompt" />
            <TextArea
              className="h-36"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Generate an image or describe how to edit the uploaded source."
            />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="primary" className="w-full" disabled={busy} onClick={() => generateImageMutation.mutate()}>
                Generate new
              </Button>
              <Button className="w-full" disabled={busy || (!activeImageDataUrl && !imageDownloadId)} onClick={() => void triggerImageEdit()}>
                Edit current
              </Button>
            </div>
          </Section>

          <Section className="space-y-3">
            <SectionTitle eyebrow="Source" title="Upload image" />
            <Button className="w-full" onClick={() => imageFileInputRef.current?.click()}>
              Upload image
            </Button>
            <input
              ref={imageFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) {
                  setMode("image");
                  setActiveImageDataUrl(await readFileAsDataUrl(file));
                  setActiveArtifact(undefined);
                }
                event.currentTarget.value = "";
              }}
            />
          </Section>

          <Section className="space-y-3">
            <SectionTitle eyebrow="Export" title="Download image" />
            {activeImageDataUrl ? (
              <a className="flex h-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/70 px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-white" href={activeImageDataUrl} download="image.png">
                Download current image
              </a>
            ) : imageDownloadId ? (
              <a className="flex h-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/70 px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-white" href={`/api/download/${imageDownloadId}`}>
                Download generated image
              </a>
            ) : (
              <p className="text-sm text-slate-500">Generate or upload an image to enable download.</p>
            )}
          </Section>
        </>
      )}

      {busy ? <div className="rounded-3xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">Workflow running...</div> : null}
      {error ? <div className="rounded-3xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-800">{error}</div> : null}
    </Panel>
  );
}
