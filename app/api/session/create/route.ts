import { NextResponse } from "next/server";
import { createSession } from "@/lib/session";
import { createSessionRequestSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = createSessionRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createSession(parsed.data);
  return NextResponse.json(result, { status: 201 });
}
