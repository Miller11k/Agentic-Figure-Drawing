import { NextResponse } from "next/server";
import { decodeBase64Data, handleRouteError, parseJsonBody } from "@/lib/api/responses";
import { createVersionStep } from "@/lib/session";
import { persistArtifactForVersion } from "@/lib/storage";
import { uploadJsonRequestSchema, uploadRequestMetadataSchema } from "@/lib/validation/schemas";

async function handleJsonUpload(request: Request) {
  const input = await parseJsonBody(request, uploadJsonRequestSchema);
  const version =
    input.versionId ??
    (
      await createVersionStep({
        sessionId: input.sessionId,
        stepType: "upload",
        mode: input.mode ?? "diagram",
        metadata: {
          route: "/api/upload",
          artifactType: input.artifactType
        }
      })
    ).id;

  const artifact = await persistArtifactForVersion({
    sessionId: input.sessionId,
    versionId: version,
    artifactType: input.artifactType ?? "source",
    fileName: input.fileName ?? "upload.bin",
    mimeType: input.mimeType ?? "application/octet-stream",
    data: decodeBase64Data(input.dataBase64),
    metadata: {
      route: "/api/upload"
    }
  });

  return NextResponse.json({ versionId: version, artifact }, { status: 201 });
}

async function handleMultipartUpload(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    throw new Error("Multipart upload requires a file field.");
  }

  const metadata = uploadRequestMetadataSchema.parse({
    sessionId: formData.get("sessionId"),
    artifactType: formData.get("artifactType") ?? undefined,
    versionId: formData.get("versionId") ?? undefined,
    mode: formData.get("mode") ?? undefined,
    fileName: formData.get("fileName") ?? file.name,
    mimeType: formData.get("mimeType") ?? file.type
  });
  const version =
    metadata.versionId ??
    (
      await createVersionStep({
        sessionId: metadata.sessionId,
        stepType: "upload",
        mode: metadata.mode,
        metadata: {
          route: "/api/upload",
          artifactType: metadata.artifactType
        }
      })
    ).id;
  const data = Buffer.from(await file.arrayBuffer());
  const artifact = await persistArtifactForVersion({
    sessionId: metadata.sessionId,
    versionId: version,
    artifactType: metadata.artifactType,
    fileName: metadata.fileName ?? file.name,
    mimeType: metadata.mimeType ?? (file.type || "application/octet-stream"),
    data,
    metadata: {
      route: "/api/upload"
    }
  });

  return NextResponse.json({ versionId: version, artifact }, { status: 201 });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      return await handleMultipartUpload(request);
    }

    return await handleJsonUpload(request);
  } catch (error) {
    return handleRouteError(error);
  }
}
