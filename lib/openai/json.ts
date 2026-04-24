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

export function parseStructuredJson<T>(
  rawText: string,
  schema: z.ZodSchema<T>,
  normalize?: (value: unknown) => unknown
): T {
  let parsed: unknown;
  const candidate = extractJsonCandidate(rawText);

  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    throw new Error(`OpenAI response was not valid JSON: ${(error as Error).message}`);
  }

  const normalized = normalize ? normalize(parsed) : parsed;
  const result = schema.safeParse(normalized);

  if (!result.success) {
    const snippet = candidate.slice(0, 700);
    throw new Error(`OpenAI response failed schema validation: ${result.error.message}. Candidate JSON: ${snippet}`);
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
