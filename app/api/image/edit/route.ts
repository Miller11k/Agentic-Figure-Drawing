import { NextResponse } from "next/server";
import { decodeBase64Data, handleRouteError, parseJsonBody } from "@/lib/api/responses";
import { imageEditWorkflowRequestSchema } from "@/lib/validation/schemas";
import { runImageEditingPipeline } from "@/lib/workflows";

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, imageEditWorkflowRequestSchema);
    const result = await runImageEditingPipeline({
      sessionId: input.sessionId,
      parentVersionId: input.parentVersionId,
      prompt: input.prompt,
      image: decodeBase64Data(input.imageBase64),
      mask: input.maskBase64 ? decodeBase64Data(input.maskBase64) : undefined
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
