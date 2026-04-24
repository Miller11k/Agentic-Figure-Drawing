import { describe, expect, it } from "vitest";
import {
  buildImageEditPayload,
  clampBrushSize,
  clampFeatherRadius,
  clampMaskOpacity,
  describeMaskRequest,
  hasMaskPixels,
  maskExportFileName,
  maskCompositeOperation,
  maskStrokeStyle,
  overlayAlphaToOpenAIMaskAlpha,
  normalizeCanvasPoint
} from "../lib/image/mask";

describe("image mask helpers", () => {
  it("normalizes pointer coordinates into natural image coordinates", () => {
    const point = normalizeCanvasPoint(
      150,
      90,
      { left: 50, top: 40, width: 200, height: 100 },
      { width: 1000, height: 500 }
    );

    expect(point).toEqual({ x: 500, y: 250 });
  });

  it("clamps mask coordinates to the image bounds", () => {
    const point = normalizeCanvasPoint(
      999,
      -20,
      { left: 50, top: 40, width: 200, height: 100 },
      { width: 1000, height: 500 }
    );

    expect(point).toEqual({ x: 1000, y: 0 });
  });

  it("omits empty masks from image edit requests", () => {
    const payload = buildImageEditPayload({
      sessionId: "session_1",
      prompt: "edit",
      imageBase64: "data:image/png;base64,image",
      maskBase64: null
    });

    expect(payload.maskBase64).toBeUndefined();
    expect(hasMaskPixels(payload.maskBase64)).toBe(false);
  });

  it("includes non-empty masks in image edit requests", () => {
    const payload = buildImageEditPayload({
      sessionId: "session_1",
      prompt: "edit",
      imageBase64: "data:image/png;base64,image",
      maskBase64: "data:image/png;base64,mask",
      imageProvider: "gemini"
    });

    expect(payload.maskBase64).toBe("data:image/png;base64,mask");
    expect(payload.imageProvider).toBe("gemini");
  });

  it("normalizes brush settings for mask tooling", () => {
    expect(clampBrushSize(500)).toBe(120);
    expect(clampBrushSize(2)).toBe(8);
    expect(clampFeatherRadius(200)).toBe(48);
    expect(clampFeatherRadius(-1)).toBe(0);
    expect(clampMaskOpacity(2)).toBe(0.9);
    expect(maskCompositeOperation("erase")).toBe("destination-out");
    expect(maskStrokeStyle(0.333)).toBe("rgba(20, 184, 166, 0.33)");
  });

  it("maps painted overlay alpha to OpenAI mask transparency without expanding tiny feather values", () => {
    expect(overlayAlphaToOpenAIMaskAlpha(0, 200, false)).toBe(255);
    expect(overlayAlphaToOpenAIMaskAlpha(9, 200, false)).toBe(0);
    expect(overlayAlphaToOpenAIMaskAlpha(1, 200, true)).toBe(255);
    expect(overlayAlphaToOpenAIMaskAlpha(100, 200, true)).toBe(128);
    expect(overlayAlphaToOpenAIMaskAlpha(200, 200, true)).toBe(0);
  });

  it("describes mask request geometry for traceable localized edits", () => {
    const metadata = describeMaskRequest({
      imageSize: { width: 1000, height: 500 },
      displaySize: { width: 500, height: 250 },
      brushSize: 42,
      mode: "paint",
      tool: "lasso",
      featherRadius: 12,
      maskBase64: "data:image/png;base64,mask"
    });

    expect(metadata).toMatchObject({
      scaleX: 2,
      scaleY: 2,
      brushSize: 42,
      tool: "lasso",
      featherRadius: 12,
      hasMask: true
    });
  });

  it("builds stable mask export file names", () => {
    expect(maskExportFileName("overlay", "cmo8x5hou0000ns34fjhdh8u6")).toBe("overlay-cmo8x5ho.png");
    expect(maskExportFileName("openai-mask")).toBe("openai-mask-local.png");
  });
});
