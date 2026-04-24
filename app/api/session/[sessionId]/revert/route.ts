import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/responses";
import { revertSessionToVersion } from "@/lib/session";
import { revertSessionRequestSchema } from "@/lib/validation/schemas";

interface RouteContext {
  params: {
    sessionId: string;
  };
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = revertSessionRequestSchema.parse(body);
    const version = await revertSessionToVersion(context.params.sessionId, parsed.versionId);
    return NextResponse.json({
      sessionId: context.params.sessionId,
      currentVersionId: version.id,
      revertedToVersionId: version.id
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
