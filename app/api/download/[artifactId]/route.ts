import { handleRouteError } from "@/lib/api/responses";
import { readArtifactBytes } from "@/lib/storage";

interface RouteContext {
  params: {
    artifactId: string;
  };
}

function fileNameFromStoragePath(storagePath: string) {
  return storagePath.split("/").at(-1) ?? "artifact";
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { artifact, data } = await readArtifactBytes(context.params.artifactId);

    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": artifact.mimeType,
        "Content-Length": String(data.byteLength),
        "Content-Disposition": `attachment; filename="${fileNameFromStoragePath(artifact.storagePath)}"`
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
