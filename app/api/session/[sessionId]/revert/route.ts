import { NextResponse } from "next/server";
import { revertSessionToVersion } from "@/lib/session";
import { revertSessionRequestSchema } from "@/lib/validation/schemas";

interface RouteContext {
  params: {
    sessionId: string;
  };
}

export async function POST(request: Request, context: RouteContext) {
  const body = await request.json().catch(() => ({}));
  const parsed = revertSessionRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const version = await revertSessionToVersion(context.params.sessionId, parsed.data.versionId);
  return NextResponse.json({
    sessionId: context.params.sessionId,
    currentVersionId: version.id
  });
}
