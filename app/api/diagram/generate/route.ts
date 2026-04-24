import { NextResponse } from "next/server";
import { handleRouteError, parseJsonBody } from "@/lib/api/responses";
import { diagramGenerateWorkflowRequestSchema } from "@/lib/validation/schemas";
import { runDiagramGenerationPipeline } from "@/lib/workflows";

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, diagramGenerateWorkflowRequestSchema);
    const result = await runDiagramGenerationPipeline(input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
