import { NextResponse } from "next/server";
import { getSessionHistory, toSessionStep } from "@/lib/session";

interface RouteContext {
  params: {
    sessionId: string;
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSessionHistory(context.params.sessionId);

  return NextResponse.json({
    id: session.id,
    title: session.title,
    currentVersionId: session.currentVersionId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    steps: session.versions.map(toSessionStep),
    artifacts: session.artifacts,
    traces: session.traces
  });
}
