import { z } from "zod";

export function parseStructuredJson<T>(rawText: string, schema: z.ZodSchema<T>): T {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new Error(`OpenAI response was not valid JSON: ${(error as Error).message}`);
  }

  return schema.parse(parsed);
}
