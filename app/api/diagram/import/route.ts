import { NextResponse } from "next/server";
import { handleRouteError, parseJsonBody } from "@/lib/api/responses";
import { diagramImportRequestSchema } from "@/lib/validation/schemas";
import { runDiagramImportPipeline } from "@/lib/workflows";

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, diagramImportRequestSchema);
    const result = await runDiagramImportPipeline(input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
