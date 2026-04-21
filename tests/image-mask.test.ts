import { describe, expect, it } from "vitest";
import { buildImageEditPayload, hasMaskPixels, normalizeCanvasPoint } from "../lib/image/mask";

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
      maskBase64: "data:image/png;base64,mask"
    });

    expect(payload.maskBase64).toBe("data:image/png;base64,mask");
  });
});
