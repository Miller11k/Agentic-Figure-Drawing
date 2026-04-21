import OpenAI, { toFile } from "openai";
import type { OpenAIClientAdapter, OpenAIImageResult, OpenAIModelConfig, OpenAITextResult } from "./types";

let cachedClient: OpenAI | null = null;

const DEFAULT_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL ?? "gpt-4o-mini";
const DEFAULT_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";

export function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required before running OpenAI-backed workflows.");
  }

  cachedClient ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  return cachedClient;
}

export function getOpenAIModelConfig(): OpenAIModelConfig {
  return {
    textModel: DEFAULT_TEXT_MODEL,
    imageModel: DEFAULT_IMAGE_MODEL
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: { attempts?: number; initialDelayMs?: number } = {}
): Promise<T> {
  const attempts = options.attempts ?? 2;
  const initialDelayMs = options.initialDelayMs ?? 500;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await sleep(initialDelayMs * attempt);
      }
    }
  }

  throw lastError;
}

function imageFromBase64(data: string | undefined): Buffer {
  if (!data) {
    throw new Error("OpenAI image response did not include base64 image data.");
  }

  return Buffer.from(data, "base64");
}

export class DefaultOpenAIClientAdapter implements OpenAIClientAdapter {
  constructor(
    private readonly clientFactory = getOpenAIClient,
    private readonly modelConfig = getOpenAIModelConfig()
  ) {}

  async generateText(input: {
    systemPrompt: string;
    userPrompt: string;
    model?: string;
    responseFormat?: "json_object" | "text";
  }): Promise<OpenAITextResult> {
    const model = input.model ?? this.modelConfig.textModel;
    const completion = await withRetry(() =>
      this.clientFactory().chat.completions.create({
        model,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt }
        ],
        response_format: input.responseFormat === "json_object" ? { type: "json_object" } : undefined
      })
    );

    return {
      text: completion.choices[0]?.message?.content ?? "",
      modelUsed: completion.model,
      tokenUsage: {
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens
      }
    };
  }

  async generateImage(input: {
    prompt: string;
    model?: string;
    size?: "1024x1024" | "1536x1024" | "1024x1536" | "auto";
  }): Promise<OpenAIImageResult> {
    const model = input.model ?? this.modelConfig.imageModel;
    const response = await withRetry(() =>
      this.clientFactory().images.generate({
        model,
        prompt: input.prompt,
        n: 1,
        size: input.size ?? "1024x1024",
        output_format: "png"
      })
    );

    const first = response.data?.[0];

    return {
      image: imageFromBase64(first?.b64_json),
      mimeType: "image/png",
      modelUsed: model,
      revisedPrompt: first?.revised_prompt,
      tokenUsage: response.usage
    };
  }

  async editImage(input: {
    image: Buffer;
    prompt: string;
    mask?: Buffer;
    model?: string;
    imageFileName?: string;
    maskFileName?: string;
  }): Promise<OpenAIImageResult> {
    const model = input.model ?? this.modelConfig.imageModel;
    const image = await toFile(input.image, input.imageFileName ?? "source.png", { type: "image/png" });
    const mask = input.mask
      ? await toFile(input.mask, input.maskFileName ?? "mask.png", { type: "image/png" })
      : undefined;

    const response = await withRetry(() =>
      this.clientFactory().images.edit({
        model,
        image,
        mask,
        prompt: input.prompt,
        n: 1,
        size: "1024x1024"
      })
    );

    const first = response.data?.[0];

    return {
      image: imageFromBase64(first?.b64_json),
      mimeType: "image/png",
      modelUsed: model,
      revisedPrompt: first?.revised_prompt,
      tokenUsage: response.usage
    };
  }
}

export const defaultOpenAIClientAdapter = new DefaultOpenAIClientAdapter();
