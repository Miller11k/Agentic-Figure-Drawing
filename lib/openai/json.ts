import { z } from "zod";

export interface StructuredJsonParseResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export function extractJsonCandidate(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstObject = trimmed.indexOf("{");
  const lastObject = trimmed.lastIndexOf("}");

  if (firstObject >= 0 && lastObject > firstObject) {
    return trimmed.slice(firstObject, lastObject + 1);
  }

  const firstArray = trimmed.indexOf("[");
  const lastArray = trimmed.lastIndexOf("]");

  if (firstArray >= 0 && lastArray > firstArray) {
    return trimmed.slice(firstArray, lastArray + 1);
  }

  return trimmed;
}

export function parseStructuredJson<T>(rawText: string, schema: z.ZodSchema<T>): T {
  let parsed: unknown;

  try {
    parsed = JSON.parse(extractJsonCandidate(rawText));
  } catch (error) {
    throw new Error(`OpenAI response was not valid JSON: ${(error as Error).message}`);
  }

  const result = schema.safeParse(parsed);

  if (!result.success) {
    throw new Error(`OpenAI response failed schema validation: ${result.error.message}`);
  }

  return result.data;
}

export function safeParseStructuredJson<T>(
  rawText: string,
  schema: z.ZodSchema<T>
): StructuredJsonParseResult<T> {
  try {
    return { ok: true, data: parseStructuredJson(rawText, schema) };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
