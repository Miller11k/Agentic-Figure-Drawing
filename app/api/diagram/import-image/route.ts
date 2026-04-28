import { NextResponse } from "next/server";
import { decodeBase64Data, handleRouteError, parseJsonBody } from "@/lib/api/responses";
import { diagramImageImportRequestSchema } from "@/lib/validation/schemas";
import { runDiagramImageReconstructionPipeline } from "@/lib/workflows";

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, diagramImageImportRequestSchema);
    const result = await runDiagramImageReconstructionPipeline({
      sessionId: input.sessionId,
      parentVersionId: input.parentVersionId,
      image: decodeBase64Data(input.imageBase64),
      prompt: input.prompt,
      mimeType: input.mimeType,
      fileName: input.fileName
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
