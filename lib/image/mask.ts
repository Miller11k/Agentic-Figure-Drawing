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
