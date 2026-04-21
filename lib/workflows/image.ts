import { getOpenAIModelConfig, openAIWorkflowService } from "@/lib/openai";
import { createVersionStep, updateVersionStructuredState } from "@/lib/session";
import { persistArtifactForVersion } from "@/lib/storage";
import { runTracedStage, summarizeForTrace } from "@/lib/trace";
import type { ImageEditingWorkflowInput, ImageGenerationWorkflowInput, ImageWorkflowResult } from "./types";

export async function runImageGenerationPipeline(
  input: ImageGenerationWorkflowInput
): Promise<ImageWorkflowResult> {
  const models = getOpenAIModelConfig();
  const version = await createVersionStep({
    sessionId: input.sessionId,
    parentVersionId: input.parentVersionId,
    stepType: "prompt",
    mode: "image",
    prompt: input.prompt,
    metadata: { pipelineName: "image-generation", status: "started" }
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
      modelUsed: models.imageModel
    },
    () => openAIWorkflowService.generateImageFromPrompt(input.prompt),
    (result) => summarizeForTrace({ bytes: result.image.byteLength, mimeType: result.mimeType })
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
      revisedPrompt: imageResult.revisedPrompt,
      tokenUsage: imageResult.tokenUsage
    }
  });

  await updateVersionStructuredState({
    versionId: version.id,
    parsedIntent,
    imageMetadata: {
      mimeType: imageResult.mimeType,
      bytes: imageResult.image.byteLength,
      revisedPrompt: imageResult.revisedPrompt
    },
    metadata: {
      pipelineName: "image-generation",
      status: "completed",
      artifactId: artifact.id
    }
  });

  return {
    versionId: version.id,
    parsedIntent,
    artifactId: artifact.id,
    mimeType: imageResult.mimeType,
    bytes: imageResult.image.byteLength,
    revisedPrompt: imageResult.revisedPrompt
  };
}

export async function runImageEditingPipeline(input: ImageEditingWorkflowInput): Promise<ImageWorkflowResult> {
  const models = getOpenAIModelConfig();
  const version = await createVersionStep({
    sessionId: input.sessionId,
    parentVersionId: input.parentVersionId,
    stepType: "prompt",
    mode: "image",
    prompt: input.prompt,
    metadata: {
      pipelineName: "image-editing",
      status: "started",
      hasMask: Boolean(input.mask)
    }
  });

  const traceBase = {
    sessionId: input.sessionId,
    versionId: version.id,
    pipelineName: "image-editing"
  };

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
      modelUsed: models.imageModel
    },
    () => openAIWorkflowService.editImageWithPrompt(input.image, input.prompt, input.mask),
    (result) => summarizeForTrace({ bytes: result.image.byteLength, mimeType: result.mimeType })
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
      revisedPrompt: imageResult.revisedPrompt,
      tokenUsage: imageResult.tokenUsage,
      hasMask: Boolean(input.mask)
    }
  });

  await updateVersionStructuredState({
    versionId: version.id,
    parsedIntent,
    imageMetadata: {
      mimeType: imageResult.mimeType,
      bytes: imageResult.image.byteLength,
      revisedPrompt: imageResult.revisedPrompt,
      hasMask: Boolean(input.mask)
    },
    metadata: {
      pipelineName: "image-editing",
      status: "completed",
      artifactId: artifact.id
    }
  });

  return {
    versionId: version.id,
    parsedIntent,
    artifactId: artifact.id,
    mimeType: imageResult.mimeType,
    bytes: imageResult.image.byteLength,
    revisedPrompt: imageResult.revisedPrompt
  };
}
