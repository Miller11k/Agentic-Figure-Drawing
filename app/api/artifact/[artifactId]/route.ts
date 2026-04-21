import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/responses";
import { getArtifactRecord } from "@/lib/storage";

interface RouteContext {
  params: {
    artifactId: string;
  };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const artifact = await getArtifactRecord(context.params.artifactId);
    return NextResponse.json({ artifact });
  } catch (error) {
    return handleRouteError(error);
  }
}
