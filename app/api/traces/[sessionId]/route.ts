import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/responses";
import { listSessionTraces } from "@/lib/trace";

interface RouteContext {
  params: {
    sessionId: string;
  };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const traces = await listSessionTraces(context.params.sessionId);
    return NextResponse.json({ traces });
  } catch (error) {
    return handleRouteError(error);
  }
}
