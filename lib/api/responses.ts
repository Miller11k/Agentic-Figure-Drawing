import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";

export function jsonError(message: string, status = 500, details?: unknown) {
  return NextResponse.json(
    {
      error: {
        message,
        details
      }
    },
    { status }
  );
}

export async function parseJsonBody<T>(request: Request, schema: z.ZodSchema<T>): Promise<T> {
  const body = await request.json().catch(() => {
    throw new Error("Request body must be valid JSON.");
  });

  return schema.parse(body);
}

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return jsonError("Request validation failed.", 400, error.flatten());
  }

  if (error instanceof Error) {
    const status = error.message.includes("not found") || error.message.includes("No ") ? 404 : 500;
    return jsonError(error.message, status);
  }

  return jsonError("Unexpected route error.");
}

export function decodeBase64Data(input: string): Buffer {
  const [, maybeData] = input.match(/^data:[^;]+;base64,(.*)$/) ?? [];
  return Buffer.from(maybeData ?? input, "base64");
}
