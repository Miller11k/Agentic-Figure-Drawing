"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  createSession,
  editDiagram,
  generateDiagram,
  generateImage,
  importDiagramImage,
  importDiagram,
  uploadArtifact
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
    activeArtifactId,
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
    requestImageEdit,
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
      const result = await importDiagram(session.sessionId, input.content, input.fileName, session.versionId);
      return { ...result, sessionId: session.sessionId };
    },
    onSuccess: (result) => {
      setError(null);
      setMode("diagram");
      setActiveVersion(result.versionId);
      setActiveArtifact(result.artifactId);
      setDiagramState(result.diagramModel, result.xml);
      invalidate(result.sessionId);
    },
    onError: (err) => setError((err as Error).message)
  });

  const importImageDiagramMutation = useMutation({
    mutationFn: async (input: { dataUrl: string; fileName: string; mimeType: string }) => {
      const session = await ensureSession();
      const result = await importDiagramImage({
        sessionId: session.sessionId,
        imageBase64: input.dataUrl,
        prompt: prompt.trim() || undefined,
        fileName: input.fileName,
        mimeType: input.mimeType,
        parentVersionId: session.versionId
      });
      return { ...result, sessionId: session.sessionId };
    },
    onSuccess: (result) => {
      setError(null);
      setMode("diagram");
      setActiveVersion(result.versionId);
      setActiveArtifact(result.artifactId);
      setDiagramState(result.diagramModel, result.xml);
      invalidate(result.sessionId);
    },
    onError: (err) => setError((err as Error).message)
  });

  const imageDownloadId = activeArtifactId;
  const currentDiagramXml = activeDiagramModel ? createDrawioXmlFromModel(activeDiagramModel) : undefined;

  const generateDiagramMutation = useMutation({
    mutationFn: async () => {
      if (!prompt.trim()) throw new Error("Enter a prompt first.");
      const session = await ensureSession();
      const result = await generateDiagram(session.sessionId, prompt, session.versionId, imageProvider);
      return { ...result, sessionId: session.sessionId };
    },
    onSuccess: (result) => {
      setError(null);
      setMode("diagram");
      setActiveVersion(result.versionId);
      setActiveArtifact(result.artifactId);
      setDiagramState(result.diagramModel, result.xml);
      invalidate(result.sessionId);
    },
    onError: (err) => setError((err as Error).message)
  });

  const editDiagramMutation = useMutation({
    mutationFn: async () => {
      if (!activeDiagramModel || !currentDiagramXml) throw new Error("Load or generate a diagram before editing it.");
      if (!prompt.trim()) throw new Error("Enter an edit prompt first.");
      const session = await ensureSession();
      const result = await editDiagram(session.sessionId, prompt, activeDiagramModel, currentDiagramXml, session.versionId);
      return { ...result, sessionId: session.sessionId };
    },
    onSuccess: (result) => {
      setError(null);
      setMode("diagram");
      setActiveVersion(result.versionId);
      setActiveArtifact(result.artifactId);
      setDiagramState(result.diagramModel, result.xml);
      invalidate(result.sessionId);
    },
    onError: (err) => setError((err as Error).message)
  });

  const generateImageMutation = useMutation({
    mutationFn: async () => {
      if (!prompt.trim()) throw new Error("Enter a prompt first.");
      const session = await ensureSession();
      const result = await generateImage(session.sessionId, prompt, session.versionId, imageProvider);
      return { ...result, sessionId: session.sessionId };
    },
    onSuccess: (result) => {
      setError(null);
      setMode("image");
      setActiveVersion(result.versionId);
      setActiveArtifact(result.artifactId);
      setDiagramState(undefined, undefined);
      setActiveImageDataUrl(undefined);
      invalidate(result.sessionId);
    },
    onError: (err) => setError((err as Error).message)
  });

  const uploadImageMutation = useMutation({
    mutationFn: async (input: { dataUrl: string; fileName: string; mimeType: string }) => {
      const session = await ensureSession();
      const result = await uploadArtifact({
        sessionId: session.sessionId,
        dataBase64: input.dataUrl,
        artifactType: "source",
        mode: "image",
        fileName: input.fileName,
        mimeType: input.mimeType
      });

      return {
        ...result,
        sessionId: session.sessionId,
        localDataUrl: input.dataUrl
      };
    },
    onSuccess: (result) => {
      setError(null);
      setMode("image");
      setActiveVersion(result.versionId);
      setActiveArtifact(result.artifact.id);
      setDiagramState(undefined, undefined);
      setActiveImageDataUrl(result.localDataUrl);
      invalidate(result.sessionId);
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
    const session = await ensureSession();
    requestImageEdit({
      sessionId: session.sessionId,
      versionId: session.versionId ?? undefined
    });
  };

  const hasActiveContent = Boolean(activeDiagramModel || activeImageDataUrl || imageDownloadId || activeSessionId);
  const busy =
    createSessionMutation.isPending ||
    importMutation.isPending ||
    importImageDiagramMutation.isPending ||
    generateDiagramMutation.isPending ||
    editDiagramMutation.isPending ||
    generateImageMutation.isPending ||
    uploadImageMutation.isPending;

  return (
    <Panel className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
      <div className="rounded-[22px] border border-white/70 bg-white/72 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Workspace</p>
            <p className="mt-1 truncate text-base font-semibold tracking-tight text-slate-950">
              {mode === "diagram" ? "Diagram Studio" : "Image Studio"}
            </p>
          </div>
          <Pill className="capitalize">{activeSessionId ? "Saved" : "New"}</Pill>
        </div>
        {history?.title ? <p className="mt-3 truncate text-sm text-slate-500">{history.title}</p> : null}
      </div>

      <Section className="space-y-3">
        <SegmentedControl<EditorMode>
          value={mode}
          onChange={setMode}
          options={[
            { value: "diagram", label: "Diagram" },
            { value: "image", label: "Image" }
          ]}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button className="w-full" variant="secondary" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? "Hide history" : "History"}
          </Button>
          <Button className="w-full" variant="ghost" onClick={clearWorkspace} disabled={busy || !hasActiveContent}>
            Clear
          </Button>
        </div>
      </Section>

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
            <SectionTitle eyebrow="Import" title="Diagram source" />
            <Button className="w-full" disabled={busy} onClick={() => diagramFileInputRef.current?.click()}>
              Import file
            </Button>
            <input
              ref={diagramFileInputRef}
              type="file"
              accept=".drawio,.xml,.mmd,.mermaid,.md,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={async (event) => {
                const input = event.currentTarget;
                const file = event.target.files?.[0];
                if (file?.type.startsWith("image/")) {
                  importImageDiagramMutation.mutate({
                    dataUrl: await readFileAsDataUrl(file),
                    fileName: file.name,
                    mimeType: file.type || "image/png"
                  });
                } else if (file) {
                  importMutation.mutate({ content: await readFileAsText(file), fileName: file.name });
                }
                input.value = "";
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
                const input = event.currentTarget;
                const file = event.target.files?.[0];
                if (file) {
                  const dataUrl = await readFileAsDataUrl(file);
                  uploadImageMutation.mutate({
                    dataUrl,
                    fileName: file.name,
                    mimeType: file.type || "image/png"
                  });
                }
                input.value = "";
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
              <a className="flex h-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/70 px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-white" href={`/api/download/${imageDownloadId}`} download="image.png">
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
