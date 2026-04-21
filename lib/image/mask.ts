export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ImageSize {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export type MaskBrushMode = "paint" | "erase";

export function normalizeCanvasPoint(clientX: number, clientY: number, rect: RectLike, imageSize: ImageSize): Point {
  if (rect.width <= 0 || rect.height <= 0 || imageSize.width <= 0 || imageSize.height <= 0) {
    return { x: 0, y: 0 };
  }

  const x = ((clientX - rect.left) / rect.width) * imageSize.width;
  const y = ((clientY - rect.top) / rect.height) * imageSize.height;

  return {
    x: Math.max(0, Math.min(imageSize.width, x)),
    y: Math.max(0, Math.min(imageSize.height, y))
  };
}

export function clampBrushSize(value: number, min = 8, max = 120): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function clampMaskOpacity(value: number): number {
  if (!Number.isFinite(value)) return 0.62;
  return Math.max(0.15, Math.min(0.9, value));
}

export function maskCompositeOperation(mode: MaskBrushMode): GlobalCompositeOperation {
  return mode === "erase" ? "destination-out" : "source-over";
}

export function maskStrokeStyle(opacity: number): string {
  return `rgba(20, 184, 166, ${clampMaskOpacity(opacity).toFixed(2)})`;
}

export function hasMaskPixels(maskDataUrl?: string | null): boolean {
  return Boolean(maskDataUrl && maskDataUrl.length > "data:image/png;base64,".length);
}

export function buildImageEditPayload(input: {
  sessionId: string;
  prompt: string;
  imageBase64: string;
  maskBase64?: string | null;
  parentVersionId?: string | null;
}) {
  return {
    sessionId: input.sessionId,
    prompt: input.prompt,
    imageBase64: input.imageBase64,
    maskBase64: hasMaskPixels(input.maskBase64) ? input.maskBase64 ?? undefined : undefined,
    parentVersionId: input.parentVersionId
  };
}

export function describeMaskRequest(input: {
  imageSize: ImageSize;
  displaySize: ImageSize;
  brushSize: number;
  mode: MaskBrushMode;
  maskBase64?: string | null;
}) {
  const scaleX = input.displaySize.width > 0 ? input.imageSize.width / input.displaySize.width : 0;
  const scaleY = input.displaySize.height > 0 ? input.imageSize.height / input.displaySize.height : 0;

  return {
    imageWidth: input.imageSize.width,
    imageHeight: input.imageSize.height,
    displayWidth: input.displaySize.width,
    displayHeight: input.displaySize.height,
    scaleX,
    scaleY,
    brushSize: clampBrushSize(input.brushSize),
    mode: input.mode,
    hasMask: hasMaskPixels(input.maskBase64)
  };
}

export function maskExportFileName(kind: "overlay" | "openai-mask", sessionId?: string): string {
  const suffix = sessionId ? sessionId.slice(0, 8) : "local";
  return `${kind}-${suffix}.png`;
}
