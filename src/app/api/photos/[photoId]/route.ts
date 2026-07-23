import { NextResponse } from "next/server";
import { photoStorageRecord } from "@/lib/server/database";
import { readStoredImage } from "@/lib/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ photoId: string }> },
) {
  const { photoId } = await context.params;
  const record = photoStorageRecord(photoId);
  if (!record) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  try {
    const bytes = readStoredImage(record.storageKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": record.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Photo file is missing" }, { status: 404 });
  }
}
