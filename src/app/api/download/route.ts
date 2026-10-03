import { NextResponse } from "next/server";
import { completedNextinstockSession, liveDownloadConfigured } from "@/lib/server/stripe";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!liveDownloadConfigured()) return NextResponse.json({ error: "Downloads are not configured." }, { status: 503 });
  const sessionId = new URL(request.url).searchParams.get("session_id") ?? "";
  try {
    if (!await completedNextinstockSession(sessionId)) {
      return NextResponse.json({ error: "A completed order is required." }, { status: 403 });
    }
    const assetUrl = new URL(process.env.NEXTINSTOCK_RELEASE_URL!);
    if (assetUrl.protocol !== "https:") throw new Error("Release URL must use HTTPS");
    const headers = new Headers();
    if (assetUrl.hostname.endsWith(".private.blob.vercel-storage.com")) {
      headers.set("Authorization", `Bearer ${process.env.BLOB_READ_WRITE_TOKEN!}`);
    }
    const asset = await fetch(assetUrl, { headers, cache: "no-store", redirect: "error" });
    if (!asset.ok || !asset.body) throw new Error("Release download is unavailable");
    return new Response(asset.body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="Nextinstock-v0.1.0.zip"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not verify this purchase or retrieve the release." }, { status: 502 });
  }
}
