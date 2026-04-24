import { withRetry } from "@/lib/openai/client";
import type { GoogleImageEditInput, GoogleImageGenerationResult, GoogleImageModelConfig } from "./types";

const DEFAULT_GOOGLE_IMAGE_MODEL = process.env.GOOGLE_IMAGE_MODEL ?? "gemini-3.1-flash-image-preview";

export function getGoogleImageModelConfig(): GoogleImageModelConfig {
  return {
    imageModel: DEFAULT_GOOGLE_IMAGE_MODEL
  };
}

function getGoogleApiKey() {
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY or GEMINI_API_KEY is required for Gemini image generation.");
  }
  return apiKey;
}

function extractInlineImage(payload: unknown): { data: string; mimeType: string } {
  const candidates = (payload as { candidates?: Array<{ content?: { parts?: unknown[] } }> }).candidates ?? [];

  for (const candidate of candidates) {
    for (const part of candidate.content?.parts ?? []) {
      const typedPart = part as {
        inlineData?: { data?: string; mimeType?: string };
        inline_data?: { data?: string; mime_type?: string };
      };
      const data = typedPart.inlineData?.data ?? typedPart.inline_data?.data;

      if (data) {
        return {
          data,
          mimeType: typedPart.inlineData?.mimeType ?? typedPart.inline_data?.mime_type ?? "image/png"
        };
      }
    }
  }

  throw new Error("Gemini image response did not include inline image data.");
}

function extractText(payload: unknown): string | undefined {
  const candidates = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates ?? [];
  return candidates
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text)
    .filter((text): text is string => Boolean(text?.trim()))
    .join("\n")
    .trim() || undefined;
}

export class GoogleImageClient {
  constructor(private readonly modelConfig = getGoogleImageModelConfig()) {}

  async generateImage(prompt: string, model = this.modelConfig.imageModel): Promise<GoogleImageGenerationResult> {
    const apiKey = getGoogleApiKey();
    const response = await withRetry(() =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"]
          }
        })
      })
    );

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        (payload as { error?: { message?: string } } | null)?.error?.message ??
        `Gemini image generation failed with status ${response.status}`;
      throw new Error(message);
    }

    const inlineImage = extractInlineImage(payload);
    return {
      image: Buffer.from(inlineImage.data, "base64"),
      mimeType: inlineImage.mimeType,
      modelUsed: model,
      text: extractText(payload)
    };
  }

  async editImage(input: GoogleImageEditInput, model = this.modelConfig.imageModel): Promise<GoogleImageGenerationResult> {
    const apiKey = getGoogleApiKey();
    const localizedPrompt = input.mask
      ? [
          input.prompt,
          "You are given a source image and a mask image.",
          "Use the mask as a strict local edit guide: only alter the region indicated by transparent/non-white mask pixels.",
          "Preserve every unmasked area of the source image as closely as possible, including identity, background, lighting, colors, texture, and composition."
        ].join("\n")
      : input.prompt;

    const parts: Array<Record<string, unknown>> = [
      { text: localizedPrompt },
      {
        inlineData: {
          mimeType: input.imageMimeType ?? "image/png",
          data: input.image.toString("base64")
        }
      }
    ];

    if (input.mask) {
      parts.push({
        inlineData: {
          mimeType: input.maskMimeType ?? "image/png",
          data: input.mask.toString("base64")
        }
      });
    }

    const response = await withRetry(() =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts
            }
          ],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"]
          }
        })
      })
    );

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        (payload as { error?: { message?: string } } | null)?.error?.message ??
        `Gemini image editing failed with status ${response.status}`;
      throw new Error(message);
    }

    const inlineImage = extractInlineImage(payload);
    return {
      image: Buffer.from(inlineImage.data, "base64"),
      mimeType: inlineImage.mimeType,
      modelUsed: model,
      text: extractText(payload)
    };
  }
}

export const googleImageClient = new GoogleImageClient();
