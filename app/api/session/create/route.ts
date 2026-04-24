import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/responses";
import { createSession } from "@/lib/session";
import { createSessionRequestSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = createSessionRequestSchema.parse(body);
    const result = await createSession(parsed);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
