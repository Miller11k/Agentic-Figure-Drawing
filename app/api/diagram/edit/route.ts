import { NextResponse } from "next/server";
import { handleRouteError, parseJsonBody } from "@/lib/api/responses";
import { diagramEditWorkflowRequestSchema } from "@/lib/validation/schemas";
import { runDiagramEditingPipeline } from "@/lib/workflows";

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, diagramEditWorkflowRequestSchema);
    const result = await runDiagramEditingPipeline(input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
