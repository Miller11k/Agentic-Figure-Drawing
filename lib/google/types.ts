export type ImageGenerationProvider = "openai" | "gemini";

export interface GoogleImageGenerationResult {
  image: Buffer;
  mimeType: string;
  modelUsed: string;
  text?: string;
}

export interface GoogleImageEditInput {
  image: Buffer;
  prompt: string;
  mask?: Buffer;
  imageMimeType?: string;
  maskMimeType?: string;
}

export interface GoogleImageModelConfig {
  imageModel: string;
}
