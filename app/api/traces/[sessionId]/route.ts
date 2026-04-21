import { NextResponse } from "next/server";
import { listSessionTraces } from "@/lib/trace";

interface RouteContext {
  params: {
    sessionId: string;
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const traces = await listSessionTraces(context.params.sessionId);
  return NextResponse.json({ traces });
}
