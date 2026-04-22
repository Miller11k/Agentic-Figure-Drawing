"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { artifactDownloadUrl, editImage } from "@/features/session/api";
import { useEditorStore } from "@/features/session/store";
import {
  clampBrushSize,
  clampFeatherRadius,
  clampMaskOpacity,
  describeMaskRequest,
  maskExportFileName,
  maskCompositeOperation,
  overlayAlphaToOpenAIMaskAlpha,
  maskStrokeStyle,
  normalizeCanvasPoint,
  type ImageSize,
  type MaskBrushMode,
  type MaskTool
} from "@/lib/image/mask";
import { Button } from "@/components/ui";

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

function imageElementToPngDataUrl(image: HTMLImageElement): string {
  const width = image.naturalWidth;
  const height = image.naturalHeight;

  if (width <= 0 || height <= 0) {
    throw new Error("Image is still loading. Try again after the image appears in the editor.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not prepare the image for editing.");
  }

  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

function drawLine(
  canvas: HTMLCanvasElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  brushSize: number,
  mode: MaskBrushMode,
  opacity: number
) {
  const context = canvas.getContext("2d");
  if (!context) return;

  context.globalCompositeOperation = maskCompositeOperation(mode);
  context.strokeStyle = maskStrokeStyle(opacity);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = clampBrushSize(brushSize);
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.globalCompositeOperation = "source-over";
}

function drawLasso(canvas: HTMLCanvasElement, points: Array<{ x: number; y: number }>, mode: MaskBrushMode, opacity: number) {
  if (points.length < 3) return;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.globalCompositeOperation = maskCompositeOperation(mode);
  context.fillStyle = maskStrokeStyle(opacity);
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  context.closePath();
  context.fill();
  context.globalCompositeOperation = "source-over";
}

function exportOpenAIMask(canvas: HTMLCanvasElement, featherRadius = 0): string | undefined {
  const source = canvas.getContext("2d");
  if (!source) return undefined;

  const feather = clampFeatherRadius(featherRadius);
  const overlayCanvas = document.createElement("canvas");
  overlayCanvas.width = canvas.width;
  overlayCanvas.height = canvas.height;
  const overlayContext = overlayCanvas.getContext("2d");
  if (!overlayContext) return undefined;

  if (feather > 0) {
    overlayContext.filter = `blur(${feather}px)`;
    overlayContext.drawImage(canvas, 0, 0);
    overlayContext.filter = "none";
  } else {
    overlayContext.drawImage(canvas, 0, 0);
  }

  const overlay = overlayContext.getImageData(0, 0, canvas.width, canvas.height);
  const offscreen = document.createElement("canvas");
  offscreen.width = canvas.width;
  offscreen.height = canvas.height;
  const context = offscreen.getContext("2d");
  if (!context) return undefined;

  context.fillStyle = "rgba(255,255,255,1)";
  context.fillRect(0, 0, offscreen.width, offscreen.height);
  const mask = context.getImageData(0, 0, offscreen.width, offscreen.height);
  let hasStroke = false;
  let maxAlpha = 0;

  for (let index = 0; index < overlay.data.length; index += 4) {
    maxAlpha = Math.max(maxAlpha, overlay.data[index + 3]);
  }

  if (maxAlpha <= 0) return undefined;

  for (let index = 0; index < overlay.data.length; index += 4) {
    const alpha = overlay.data[index + 3];

    if (feather > 0) {
      const maskAlpha = overlayAlphaToOpenAIMaskAlpha(alpha, maxAlpha, true);
      mask.data[index + 3] = maskAlpha;
      hasStroke ||= maskAlpha < 255;
    } else {
      const maskAlpha = overlayAlphaToOpenAIMaskAlpha(alpha, maxAlpha, false);
      mask.data[index + 3] = maskAlpha;
      hasStroke ||= maskAlpha < 255;
    }
  }

  if (!hasStroke) return undefined;
  context.putImageData(mask, 0, 0);
  return offscreen.toDataURL("image/png");
}

export function ImageWorkspace({ artifactId }: { artifactId?: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize>({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState<ImageSize>({ width: 0, height: 0 });
  const [brushSize, setBrushSize] = useState(42);
  const [brushMode, setBrushMode] = useState<MaskBrushMode>("paint");
  const [maskTool, setMaskTool] = useState<MaskTool>("brush");
  const [featherRadius, setFeatherRadius] = useState(0);
  const [maskOpacity, setMaskOpacity] = useState(0.62);
  const [showMaskPreview, setShowMaskPreview] = useState(true);
  const [imageLoading, setImageLoading] = useState(Boolean(artifactId));
  const [drawing, setDrawing] = useState(false);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null);
  const [lassoPoints, setLassoPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedArtifactId, setLoadedArtifactId] = useState<string | undefined>();
  const {
    activeSessionId,
    activeVersionId,
    activeImageDataUrl,
    imageProvider,
    prompt,
    setMode,
    setActiveArtifact,
    setActiveVersion,
    setActiveImageDataUrl
  } = useEditorStore();

  const updateDisplaySize = useCallback(() => {
    const image = imageRef.current;
    const stage = stageRef.current;
    if (!image || !stage || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
    const rect = stage.getBoundingClientRect();
    const maxWidth = Math.max(120, rect.width - 40);
    const maxHeight = Math.max(120, rect.height - 40);
    const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
    setDisplaySize({
      width: Math.max(1, Math.round(image.naturalWidth * scale)),
      height: Math.max(1, Math.round(image.naturalHeight * scale))
    });
  }, []);

  useEffect(() => {
    if (!artifactId || loadedArtifactId === artifactId) return;
    setImageLoading(true);
    artifactToDataUrl(artifactId)
      .then((dataUrl) => {
        setActiveImageDataUrl(dataUrl);
        setLoadedArtifactId(artifactId);
      })
      .catch(() => setImageLoading(false));
  }, [artifactId, loadedArtifactId, setActiveImageDataUrl]);

  useEffect(() => {
    const stage = stageRef.current;
    const observer = typeof ResizeObserver !== "undefined" && stage
      ? new ResizeObserver(() => updateDisplaySize())
      : undefined;

    if (stage && observer) {
      observer.observe(stage);
    }

    window.addEventListener("resize", updateDisplaySize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateDisplaySize);
    };
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

  const downloadDataUrl = (dataUrl: string, fileName: string) => {
    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = fileName;
    anchor.click();
  };

  const downloadMaskOverlay = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    downloadDataUrl(canvas.toDataURL("image/png"), maskExportFileName("overlay", activeSessionId));
  };

  const downloadOpenAIMask = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = exportOpenAIMask(canvas, featherRadius);
    if (!dataUrl) {
      setError("Draw a mask before exporting an OpenAI edit mask.");
      return;
    }
    downloadDataUrl(dataUrl, maskExportFileName("openai-mask", activeSessionId));
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

      const imageElement = imageRef.current;
      if (!imageElement) throw new Error("No rendered image is available for editing.");

      const imageBase64 = imageElementToPngDataUrl(imageElement);
      const maskBase64 = canvasRef.current ? exportOpenAIMask(canvasRef.current, featherRadius) : undefined;
      const requestMetadata = describeMaskRequest({
        imageSize,
        displaySize,
        brushSize,
        mode: brushMode,
        tool: maskTool,
        featherRadius,
        maskBase64
      });

      console.info("Image edit mask request", requestMetadata);

      const localizedPrompt = maskBase64
        ? [
            prompt,
            "Strict localized edit constraint: only change pixels inside the transparent mask area.",
            "Preserve all unmasked / opaque-mask regions exactly, including background, lighting, colors, texture, and composition."
          ].join("\n")
        : prompt;

      return editImage(
        activeSessionId,
        localizedPrompt,
        imageBase64,
        maskBase64,
        activeVersionId,
        imageProvider
      );
    },
    onSuccess: async (result) => {
      setError(null);
      setMode("image");
      setActiveVersion(result.versionId);
      setActiveArtifact(result.artifactId);
      setLoadedArtifactId(result.artifactId);
      setUndoStack([]);
      setRedoStack([]);
      canvasRef.current?.getContext("2d")?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      const editedDataUrl = await artifactToDataUrl(result.artifactId);
      setActiveImageDataUrl(editedDataUrl);
      await queryClient.invalidateQueries({ queryKey: ["session", activeSessionId] });
    },
    onError: (err) => setError((err as Error).message)
  });

  useEffect(() => {
    const handleApplyImageEdit = () => {
      editMutation.mutate();
    };

    window.addEventListener("editor:apply-image-edit", handleApplyImageEdit);
    return () => window.removeEventListener("editor:apply-image-edit", handleApplyImageEdit);
  }, [editMutation]);

  const beginDraw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || imageSize.width === 0) return;
    snapshotMask();
    const point = normalizeCanvasPoint(event.clientX, event.clientY, canvasRef.current.getBoundingClientRect(), imageSize);
    setDrawing(true);
    setLastPoint(point);
    if (maskTool === "lasso") {
      setLassoPoints([point]);
    } else {
      drawLine(canvasRef.current, point, point, brushSize, brushMode, maskOpacity);
    }
  };

  const continueDraw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || !lastPoint || !canvasRef.current) return;
    const point = normalizeCanvasPoint(event.clientX, event.clientY, canvasRef.current.getBoundingClientRect(), imageSize);
    if (maskTool === "lasso") {
      setLassoPoints((points) => [...points, point]);
    } else {
      drawLine(canvasRef.current, lastPoint, point, brushSize, brushMode, maskOpacity);
    }
    setLastPoint(point);
  };

  const endDraw = () => {
    if (maskTool === "lasso" && canvasRef.current && lassoPoints.length >= 3) {
      drawLasso(canvasRef.current, lassoPoints, brushMode, maskOpacity);
    }
    setDrawing(false);
    setLastPoint(null);
    setLassoPoints([]);
  };

  if (!artifactId && !activeImageDataUrl) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center rounded-[32px] border border-dashed border-slate-300/80 bg-white/62 shadow-inner backdrop-blur-xl">
        <div className="max-w-md text-center">
          <p className="text-xl font-semibold tracking-[-0.03em] text-slate-900">No image loaded</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Generate an image from the left panel or upload a source image here to start prompt-based editing.
          </p>
          <Button
            variant="primary"
            className="mt-5"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload source image
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) {
                setActiveImageDataUrl(await readFileAsDataUrl(file));
                setLoadedArtifactId(undefined);
                setImageLoading(true);
              }
              event.currentTarget.value = "";
            }}
          />
        </div>
      </div>
    );
  }

  const src = activeImageDataUrl ?? (artifactId ? artifactDownloadUrl(artifactId) : undefined);

  return (
    <div className="flex h-full min-h-[520px] flex-col overflow-hidden rounded-[32px] border border-white/70 bg-white/70 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200/70 bg-white/58 p-3">
        <Button onClick={() => fileInputRef.current?.click()}>
          Upload source
        </Button>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Brush
          <input
            type="range"
            min="8"
            max="120"
            value={brushSize}
            onChange={(event) => setBrushSize(clampBrushSize(Number(event.target.value)))}
          />
          <span className="w-8 text-right">{brushSize}</span>
        </label>
        <div className="flex h-10 overflow-hidden rounded-full border border-slate-200 bg-slate-100/80 p-1 text-sm">
          {(["brush", "lasso"] as const).map((tool) => (
            <button
              key={tool}
              className={`rounded-full px-3 capitalize transition ${maskTool === tool ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
              onClick={() => setMaskTool(tool)}
              type="button"
            >
              {tool}
            </button>
          ))}
        </div>
        <div className="flex h-10 overflow-hidden rounded-full border border-slate-200 bg-slate-100/80 p-1 text-sm">
          <button
            className={`rounded-full px-3 transition ${brushMode === "paint" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            onClick={() => setBrushMode("paint")}
            type="button"
          >
            Paint
          </button>
          <button
            className={`rounded-full px-3 transition ${brushMode === "erase" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            onClick={() => setBrushMode("erase")}
            type="button"
          >
            Erase
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Opacity
          <input
            type="range"
            min="15"
            max="90"
            value={Math.round(maskOpacity * 100)}
            onChange={(event) => setMaskOpacity(clampMaskOpacity(Number(event.target.value) / 100))}
          />
          <span className="w-8 text-right">{Math.round(maskOpacity * 100)}</span>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Feather
          <input
            type="range"
            min="0"
            max="48"
            value={featherRadius}
            onChange={(event) => setFeatherRadius(clampFeatherRadius(Number(event.target.value)))}
          />
          <span className="w-8 text-right">{featherRadius}</span>
        </label>
        <Button onClick={undo} disabled={undoStack.length === 0}>
          Undo
        </Button>
        <Button onClick={redo} disabled={redoStack.length === 0}>
          Redo
        </Button>
        <Button onClick={clearMask}>
          Clear mask
        </Button>
        <label className="flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 text-sm font-medium text-slate-700 shadow-sm">
          <input type="checkbox" checked={showMaskPreview} onChange={(event) => setShowMaskPreview(event.target.checked)} />
          Preview
        </label>
        <Button onClick={downloadMaskOverlay}>
          Export overlay
        </Button>
        <Button onClick={downloadOpenAIMask}>
          Export edit mask
        </Button>
        <span className="ml-auto rounded-full border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-500">
          Use Edit current in the left panel
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) {
              setActiveImageDataUrl(await readFileAsDataUrl(file));
              setLoadedArtifactId(undefined);
              setImageLoading(true);
              setUndoStack([]);
              setRedoStack([]);
            }
            event.currentTarget.value = "";
          }}
        />
      </div>

      {(error || editMutation.isPending) && (
        <div className="border-b border-slate-200/70 bg-white/72 px-4 py-3 text-sm">
          {editMutation.isPending ? <span className="text-amber-700">Submitting image edit...</span> : null}
          {error ? <span className="text-red-700">{error}</span> : null}
        </div>
      )}

      <div ref={stageRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[linear-gradient(135deg,rgba(248,250,252,0.96),rgba(255,255,255,0.74))] p-5">
        <div
          className="relative overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.14)]"
          style={{
            width: displaySize.width || undefined,
            height: displaySize.height || undefined,
            maxWidth: "100%",
            maxHeight: "100%"
          }}
        >
          {imageLoading ? (
            <div className="absolute inset-0 z-10 flex min-h-[260px] min-w-[360px] items-center justify-center bg-white/88 text-sm font-medium text-slate-500 backdrop-blur">
              Loading image...
            </div>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={src}
            alt=""
            className={`block object-contain transition-opacity ${imageLoading ? "opacity-0" : "opacity-100"}`}
            style={{ width: displaySize.width || undefined, height: displaySize.height || undefined }}
            onLoad={(event) => {
              const image = event.currentTarget;
              setImageLoading(false);
              setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
              requestAnimationFrame(updateDisplaySize);
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
            style={{ width: displaySize.width, height: displaySize.height, opacity: showMaskPreview ? 1 : 0.08 }}
            onPointerDown={beginDraw}
            onPointerMove={continueDraw}
            onPointerUp={endDraw}
            onPointerLeave={endDraw}
          />
          {maskTool === "lasso" && lassoPoints.length > 1 ? (
            <svg
              className="pointer-events-none absolute left-0 top-0"
              style={{ width: displaySize.width, height: displaySize.height }}
              viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
            >
              <polyline
                points={lassoPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                fill="none"
                stroke="#0f766e"
                strokeDasharray="10 8"
                strokeWidth={Math.max(2, brushSize / 10)}
              />
            </svg>
          ) : null}
        </div>
      </div>
    </div>
  );
}
