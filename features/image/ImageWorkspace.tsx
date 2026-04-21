"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { artifactDownloadUrl, editImage } from "@/features/session/api";
import { useEditorStore } from "@/features/session/store";
import { normalizeCanvasPoint, type ImageSize } from "@/lib/image/mask";

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function artifactToDataUrl(artifactId: string) {
  const response = await fetch(artifactDownloadUrl(artifactId));
  const blob = await response.blob();
  return readFileAsDataUrl(new File([blob], "artifact.png", { type: blob.type || "image/png" }));
}

function drawLine(
  canvas: HTMLCanvasElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  brushSize: number
) {
  const context = canvas.getContext("2d");
  if (!context) return;

  context.strokeStyle = "rgba(20, 184, 166, 0.62)";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = brushSize;
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
}

function exportOpenAIMask(canvas: HTMLCanvasElement): string | undefined {
  const source = canvas.getContext("2d");
  if (!source) return undefined;

  const overlay = source.getImageData(0, 0, canvas.width, canvas.height);
  const offscreen = document.createElement("canvas");
  offscreen.width = canvas.width;
  offscreen.height = canvas.height;
  const context = offscreen.getContext("2d");
  if (!context) return undefined;

  context.fillStyle = "rgba(255,255,255,1)";
  context.fillRect(0, 0, offscreen.width, offscreen.height);
  const mask = context.getImageData(0, 0, offscreen.width, offscreen.height);
  let hasStroke = false;

  for (let index = 0; index < overlay.data.length; index += 4) {
    if (overlay.data[index + 3] > 0) {
      mask.data[index + 3] = 0;
      hasStroke = true;
    }
  }

  if (!hasStroke) return undefined;
  context.putImageData(mask, 0, 0);
  return offscreen.toDataURL("image/png");
}

export function ImageWorkspace({ artifactId }: { artifactId?: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize>({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState<ImageSize>({ width: 0, height: 0 });
  const [brushSize, setBrushSize] = useState(42);
  const [drawing, setDrawing] = useState(false);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const {
    activeSessionId,
    activeVersionId,
    activeImageDataUrl,
    prompt,
    setMode,
    setActiveArtifact,
    setActiveVersion,
    setActiveImageDataUrl
  } = useEditorStore();

  const updateDisplaySize = useCallback(() => {
    const image = imageRef.current;
    if (!image) return;
    const rect = image.getBoundingClientRect();
    setDisplaySize({ width: rect.width, height: rect.height });
  }, []);

  useEffect(() => {
    if (!artifactId || activeImageDataUrl) return;
    artifactToDataUrl(artifactId)
      .then(setActiveImageDataUrl)
      .catch(() => undefined);
  }, [activeImageDataUrl, artifactId, setActiveImageDataUrl]);

  useEffect(() => {
    window.addEventListener("resize", updateDisplaySize);
    return () => window.removeEventListener("resize", updateDisplaySize);
  }, [updateDisplaySize]);

  const snapshotMask = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setUndoStack((stack) => [...stack, canvas.toDataURL("image/png")]);
    setRedoStack([]);
  };

  const restoreMask = (dataUrl: string) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = dataUrl;
  };

  const clearMask = () => {
    snapshotMask();
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const undo = () => {
    const canvas = canvasRef.current;
    if (!canvas || undoStack.length === 0) return;
    const previous = undoStack.at(-1)!;
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, canvas.toDataURL("image/png")]);
    restoreMask(previous);
  };

  const redo = () => {
    const canvas = canvasRef.current;
    if (!canvas || redoStack.length === 0) return;
    const next = redoStack.at(-1)!;
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, canvas.toDataURL("image/png")]);
    restoreMask(next);
  };

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!activeSessionId) throw new Error("Create a session before editing an image.");
      if (!activeImageDataUrl) throw new Error("Upload or generate an image before editing.");
      if (!prompt.trim()) throw new Error("Enter an edit prompt first.");

      return editImage(
        activeSessionId,
        prompt,
        activeImageDataUrl,
        canvasRef.current ? exportOpenAIMask(canvasRef.current) : undefined,
        activeVersionId
      );
    },
    onSuccess: async (result) => {
      setError(null);
      setMode("image");
      setActiveVersion(result.versionId);
      setActiveArtifact(result.artifactId);
      setActiveImageDataUrl(undefined);
      await queryClient.invalidateQueries({ queryKey: ["session", activeSessionId] });
    },
    onError: (err) => setError((err as Error).message)
  });

  const beginDraw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || imageSize.width === 0) return;
    snapshotMask();
    const point = normalizeCanvasPoint(event.clientX, event.clientY, canvasRef.current.getBoundingClientRect(), imageSize);
    setDrawing(true);
    setLastPoint(point);
    drawLine(canvasRef.current, point, point, brushSize);
  };

  const continueDraw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || !lastPoint || !canvasRef.current) return;
    const point = normalizeCanvasPoint(event.clientX, event.clientY, canvasRef.current.getBoundingClientRect(), imageSize);
    drawLine(canvasRef.current, lastPoint, point, brushSize);
    setLastPoint(point);
  };

  const endDraw = () => {
    setDrawing(false);
    setLastPoint(null);
  };

  if (!artifactId && !activeImageDataUrl) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center border border-dashed border-slate-300 bg-white">
        <div className="max-w-md text-center">
          <p className="text-lg font-semibold text-slate-800">No image loaded</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Generate an image from the left panel or upload a source image here to start prompt-based editing.
          </p>
          <button
            className="mt-4 h-10 border border-slate-900 bg-slate-950 px-4 text-sm font-medium text-white"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload source image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) setActiveImageDataUrl(await readFileAsDataUrl(file));
              event.currentTarget.value = "";
            }}
          />
        </div>
      </div>
    );
  }

  const src = activeImageDataUrl ?? (artifactId ? artifactDownloadUrl(artifactId) : undefined);

  return (
    <div className="flex h-full min-h-[520px] flex-col border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 p-3">
        <button className="h-9 border border-slate-300 bg-white px-3 text-sm font-medium" onClick={() => fileInputRef.current?.click()}>
          Upload source
        </button>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Brush
          <input
            type="range"
            min="8"
            max="120"
            value={brushSize}
            onChange={(event) => setBrushSize(Number(event.target.value))}
          />
          <span className="w-8 text-right">{brushSize}</span>
        </label>
        <button className="h-9 border border-slate-300 bg-white px-3 text-sm font-medium" onClick={undo} disabled={undoStack.length === 0}>
          Undo
        </button>
        <button className="h-9 border border-slate-300 bg-white px-3 text-sm font-medium" onClick={redo} disabled={redoStack.length === 0}>
          Redo
        </button>
        <button className="h-9 border border-slate-300 bg-white px-3 text-sm font-medium" onClick={clearMask}>
          Clear mask
        </button>
        <button
          className="ml-auto h-9 border border-teal-700 bg-teal-700 px-3 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => editMutation.mutate()}
          disabled={editMutation.isPending}
        >
          Apply image edit
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) {
              setActiveImageDataUrl(await readFileAsDataUrl(file));
              setUndoStack([]);
              setRedoStack([]);
            }
            event.currentTarget.value = "";
          }}
        />
      </div>

      {(error || editMutation.isPending) && (
        <div className="border-b border-slate-200 bg-white px-3 py-2 text-sm">
          {editMutation.isPending ? <span className="text-amber-700">Submitting image edit...</span> : null}
          {error ? <span className="text-red-700">{error}</span> : null}
        </div>
      )}

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-100 p-5">
        <div className="relative inline-block max-h-full max-w-full border border-slate-300 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={src}
            alt="Editable source"
            className="block max-h-[65vh] max-w-full object-contain"
            onLoad={(event) => {
              const image = event.currentTarget;
              setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
              updateDisplaySize();
              const canvas = canvasRef.current;
              if (canvas) {
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
              }
            }}
          />
          <canvas
            ref={canvasRef}
            className="absolute left-0 top-0 touch-none"
            style={{ width: displaySize.width, height: displaySize.height }}
            onPointerDown={beginDraw}
            onPointerMove={continueDraw}
            onPointerUp={endDraw}
            onPointerLeave={endDraw}
          />
        </div>
      </div>
    </div>
  );
}
