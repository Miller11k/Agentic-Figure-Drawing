import { getGoogleImageModelConfig, googleImageClient, type ImageGenerationProvider } from "@/lib/google";
import { getOpenAIModelConfig, openAIWorkflowService } from "@/lib/openai";
import { createVersionStep, updateVersionStructuredState } from "@/lib/session";
import { persistArtifactForVersion } from "@/lib/storage";
import { runTracedStage, summarizeForTrace } from "@/lib/trace";
import type { ImageEditingWorkflowInput, ImageGenerationWorkflowInput, ImageWorkflowResult } from "./types";

function revisedPromptFor(result: { revisedPrompt?: string; text?: string }) {
  return result.revisedPrompt ?? result.text;
}

function tokenUsageFor(result: unknown) {
  return typeof result === "object" && result !== null && "tokenUsage" in result
    ? (result as { tokenUsage?: unknown }).tokenUsage
    : undefined;
}

function defaultImageProvider(): ImageGenerationProvider {
  const configured = process.env.IMAGE_GENERATION_PROVIDER;
  return configured === "gemini" ? "gemini" : "openai";
}

export async function runImageGenerationPipeline(
  input: ImageGenerationWorkflowInput
): Promise<ImageWorkflowResult> {
  const models = getOpenAIModelConfig();
  const googleModels = getGoogleImageModelConfig();
  const provider = input.imageProvider ?? defaultImageProvider();
  const version = await createVersionStep({
    sessionId: input.sessionId,
    parentVersionId: input.parentVersionId,
    stepType: "prompt",
    mode: "image",
    prompt: input.prompt,
    metadata: { pipelineName: "image-generation", status: "started", provider }
  });

  const traceBase = {
    sessionId: input.sessionId,
    versionId: version.id,
    pipelineName: "image-generation"
  };

  const { result: parsedIntent } = await runTracedStage(
    {
      ...traceBase,
      stageName: "parse-edit-intent",
      inputSummary: summarizeForTrace({ prompt: input.prompt, mode: "image" }),
      modelUsed: models.textModel
    },
    () => openAIWorkflowService.parseEditIntent(input.prompt, "image")
  );

  const { result: imageResult } = await runTracedStage(
    {
      ...traceBase,
      stageName: "generate-image",
      inputSummary: summarizeForTrace({ prompt: input.prompt }),
      modelUsed: provider === "gemini" ? googleModels.imageModel : models.imageModel
    },
    () =>
      provider === "gemini"
        ? googleImageClient.generateImage(input.prompt)
        : openAIWorkflowService.generateImageFromPrompt(input.prompt),
    (result) => summarizeForTrace({ bytes: result.image.byteLength, mimeType: result.mimeType, provider })
  );

  const artifact = await persistArtifactForVersion({
    sessionId: input.sessionId,
    versionId: version.id,
    artifactType: "image",
    fileName: "generated.png",
    mimeType: imageResult.mimeType,
    data: imageResult.image,
    metadata: {
      pipelineName: "image-generation",
      provider,
      modelUsed: imageResult.modelUsed,
      revisedPrompt: revisedPromptFor(imageResult),
      tokenUsage: tokenUsageFor(imageResult)
    }
  });

  await updateVersionStructuredState({
    versionId: version.id,
    parsedIntent,
    imageMetadata: {
      mimeType: imageResult.mimeType,
      bytes: imageResult.image.byteLength,
      revisedPrompt: revisedPromptFor(imageResult),
      provider,
      modelUsed: imageResult.modelUsed
    },
    metadata: {
      pipelineName: "image-generation",
      status: "completed",
      artifactId: artifact.id,
      provider,
      modelUsed: imageResult.modelUsed
    },
    previewArtifactId: artifact.id
  });

  return {
    versionId: version.id,
    parsedIntent,
    artifactId: artifact.id,
    mimeType: imageResult.mimeType,
    bytes: imageResult.image.byteLength,
    revisedPrompt: revisedPromptFor(imageResult),
    provider
  };
}

export async function runImageEditingPipeline(input: ImageEditingWorkflowInput): Promise<ImageWorkflowResult> {
  const models = getOpenAIModelConfig();
  const googleModels = getGoogleImageModelConfig();
  const provider = input.imageProvider ?? defaultImageProvider();
  const version = await createVersionStep({
    sessionId: input.sessionId,
    parentVersionId: input.parentVersionId,
    stepType: "prompt",
    mode: "image",
    prompt: input.prompt,
    metadata: {
      pipelineName: "image-editing",
      status: "started",
      hasMask: Boolean(input.mask),
      provider
    }
  });

  const traceBase = {
    sessionId: input.sessionId,
    versionId: version.id,
    pipelineName: "image-editing"
  };

  const sourceArtifact = await persistArtifactForVersion({
    sessionId: input.sessionId,
    versionId: version.id,
    artifactType: "source",
    fileName: "source-image.png",
    mimeType: "image/png",
    data: input.image,
    metadata: {
      pipelineName: "image-editing",
      role: "source"
    }
  });

  const maskArtifact = input.mask
    ? await persistArtifactForVersion({
        sessionId: input.sessionId,
        versionId: version.id,
        artifactType: "mask",
        fileName: "mask.png",
        mimeType: "image/png",
        data: input.mask,
        metadata: {
          pipelineName: "image-editing",
          role: "mask"
        }
      })
    : undefined;

  const { result: parsedIntent } = await runTracedStage(
    {
      ...traceBase,
      stageName: "parse-edit-intent",
      inputSummary: summarizeForTrace({ prompt: input.prompt, mode: "image", hasMask: Boolean(input.mask) }),
      modelUsed: models.textModel
    },
    () => openAIWorkflowService.parseEditIntent(input.prompt, "image")
  );

  const { result: imageResult } = await runTracedStage(
    {
      ...traceBase,
      stageName: "edit-image",
      inputSummary: summarizeForTrace({
        prompt: input.prompt,
        imageBytes: input.image.byteLength,
        maskBytes: input.mask?.byteLength ?? 0
      }),
      modelUsed: provider === "gemini" ? googleModels.imageModel : models.imageModel
    },
    () =>
      provider === "gemini"
        ? googleImageClient.editImage({ image: input.image, prompt: input.prompt, mask: input.mask })
        : openAIWorkflowService.editImageWithPrompt(input.image, input.prompt, input.mask),
    (result) => summarizeForTrace({ bytes: result.image.byteLength, mimeType: result.mimeType, provider })
  );

  const artifact = await persistArtifactForVersion({
    sessionId: input.sessionId,
    versionId: version.id,
    artifactType: "image",
    fileName: "edited.png",
    mimeType: imageResult.mimeType,
    data: imageResult.image,
    metadata: {
      pipelineName: "image-editing",
      provider,
      modelUsed: imageResult.modelUsed,
      revisedPrompt: revisedPromptFor(imageResult),
      tokenUsage: tokenUsageFor(imageResult),
      hasMask: Boolean(input.mask)
    }
  });

  await updateVersionStructuredState({
    versionId: version.id,
    parsedIntent,
    imageMetadata: {
      mimeType: imageResult.mimeType,
      bytes: imageResult.image.byteLength,
      revisedPrompt: revisedPromptFor(imageResult),
      hasMask: Boolean(input.mask),
      provider,
      modelUsed: imageResult.modelUsed,
      sourceArtifactId: sourceArtifact.id,
      maskArtifactId: maskArtifact?.id
    },
    metadata: {
      pipelineName: "image-editing",
      status: "completed",
      artifactId: artifact.id,
      sourceArtifactId: sourceArtifact.id,
      maskArtifactId: maskArtifact?.id,
      provider,
      modelUsed: imageResult.modelUsed
    },
    previewArtifactId: artifact.id
  });

  return {
    versionId: version.id,
    parsedIntent,
    artifactId: artifact.id,
    sourceArtifactId: sourceArtifact.id,
    maskArtifactId: maskArtifact?.id,
    mimeType: imageResult.mimeType,
    bytes: imageResult.image.byteLength,
    revisedPrompt: revisedPromptFor(imageResult),
    provider
  };
}
