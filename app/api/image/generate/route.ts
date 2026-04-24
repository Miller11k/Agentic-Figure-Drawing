import { NextResponse } from "next/server";
import { handleRouteError, parseJsonBody } from "@/lib/api/responses";
import { imageGenerateWorkflowRequestSchema } from "@/lib/validation/schemas";
import { runImageGenerationPipeline } from "@/lib/workflows";

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, imageGenerateWorkflowRequestSchema);
    const result = await runImageGenerationPipeline(input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
