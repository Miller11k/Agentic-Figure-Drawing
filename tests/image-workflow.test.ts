import { beforeEach, describe, expect, it, vi } from "vitest";

const createVersionStep = vi.fn(async () => ({ id: "version_image_edit" }));
const updateVersionStructuredState = vi.fn(async () => ({}));
const persistArtifactForVersion = vi.fn(async (input: { artifactType: string }) => ({
  id: `${input.artifactType}_artifact`,
  ...input
}));

vi.mock("@/lib/session", () => ({
  createVersionStep,
  updateVersionStructuredState
}));

vi.mock("@/lib/storage", () => ({
  persistArtifactForVersion
}));

vi.mock("@/lib/trace", () => ({
  summarizeForTrace: (value: unknown) => JSON.stringify(value),
  runTracedStage: async (_input: unknown, operation: () => Promise<unknown>) => ({ result: await operation() })
}));

vi.mock("@/lib/openai", () => ({
  getOpenAIModelConfig: () => ({ textModel: "text-test", imageModel: "image-test" }),
  openAIWorkflowService: {
    parseEditIntent: vi.fn(async (prompt: string) => ({
      mode: "image",
      actionType: "edit",
      targetType: "image",
      targetSelectors: [],
      attributes: {},
      confidence: 1,
      rawPrompt: prompt
    })),
    editImageWithPrompt: vi.fn(async () => ({
      image: Buffer.from("edited"),
      mimeType: "image/png",
      modelUsed: "image-test"
    }))
  }
}));

vi.mock("@/lib/google", () => ({
  getGoogleImageModelConfig: () => ({ imageModel: "gemini-test" }),
  googleImageClient: {
    generateImage: vi.fn(async () => ({
      image: Buffer.from("gemini"),
      mimeType: "image/png",
      modelUsed: "gemini-test"
    })),
    editImage: vi.fn(async () => ({
      image: Buffer.from("gemini-edited"),
      mimeType: "image/png",
      modelUsed: "gemini-test"
    }))
  }
}));

describe("image workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a version and persists source, mask, and output artifacts for masked edits", async () => {
    const { runImageEditingPipeline } = await import("../lib/workflows/image");

    const result = await runImageEditingPipeline({
      sessionId: "session_1",
      prompt: "make the selected area blue",
      image: Buffer.from("source"),
      mask: Buffer.from("mask")
    });

    expect(createVersionStep).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session_1",
        stepType: "prompt",
        mode: "image"
      })
    );
    expect(persistArtifactForVersion).toHaveBeenCalledWith(expect.objectContaining({ artifactType: "source" }));
    expect(persistArtifactForVersion).toHaveBeenCalledWith(expect.objectContaining({ artifactType: "mask" }));
    expect(persistArtifactForVersion).toHaveBeenCalledWith(expect.objectContaining({ artifactType: "image" }));
    expect(updateVersionStructuredState).toHaveBeenCalledWith(
      expect.objectContaining({
        versionId: "version_image_edit",
        imageMetadata: expect.objectContaining({
          hasMask: true,
          sourceArtifactId: "source_artifact",
          maskArtifactId: "mask_artifact"
        }),
        previewArtifactId: "image_artifact"
      })
    );
    expect(result).toMatchObject({
      versionId: "version_image_edit",
      artifactId: "image_artifact",
      sourceArtifactId: "source_artifact",
      maskArtifactId: "mask_artifact"
    });
  });

  it("can generate images through the Gemini provider", async () => {
    const { runImageGenerationPipeline } = await import("../lib/workflows/image");

    const result = await runImageGenerationPipeline({
      sessionId: "session_1",
      prompt: "create a clean diagram-like image",
      imageProvider: "gemini"
    });

    expect(result).toMatchObject({
      provider: "gemini",
      artifactId: "image_artifact",
      mimeType: "image/png"
    });
    expect(persistArtifactForVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactType: "image",
        metadata: expect.objectContaining({ provider: "gemini", modelUsed: "gemini-test" })
      })
    );
  });

  it("can edit masked images through the Gemini provider", async () => {
    const { runImageEditingPipeline } = await import("../lib/workflows/image");

    const result = await runImageEditingPipeline({
      sessionId: "session_1",
      prompt: "change only the selected area",
      image: Buffer.from("source"),
      mask: Buffer.from("mask"),
      imageProvider: "gemini"
    });

    expect(result).toMatchObject({
      provider: "gemini",
      artifactId: "image_artifact",
      sourceArtifactId: "source_artifact",
      maskArtifactId: "mask_artifact"
    });
    expect(persistArtifactForVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactType: "image",
        metadata: expect.objectContaining({ provider: "gemini", modelUsed: "gemini-test", hasMask: true })
      })
    );
  });
});
