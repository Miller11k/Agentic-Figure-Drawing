import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "openai-native-diagram-image-editor"
  });
}
