import OpenAI from "openai";

let cachedClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required before running OpenAI-backed workflows.");
  }

  cachedClient ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  return cachedClient;
}
