import { NextResponse } from "next/server";
import { paidNextinstockSession, salesConfigured } from "@/lib/server/stripe";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!salesConfigured()) return NextResponse.json({ error: "Downloads are not configured." }, { status: 503 });
  const sessionId = new URL(request.url).searchParams.get("session_id") ?? "";
  try {
    if (!await paidNextinstockSession(sessionId)) {
      return NextResponse.json({ error: "A paid purchase is required." }, { status: 403 });
    }
    const assetUrl = new URL(process.env.NEXTINSTOCK_RELEASE_URL!);
    if (assetUrl.protocol !== "https:") throw new Error("Release URL must use HTTPS");
    const asset = await fetch(assetUrl, { cache: "no-store" });
    if (!asset.ok || !asset.body) throw new Error("Release download is unavailable");
    return new Response(asset.body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="Nextinstock-v1.zip"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not verify this purchase or retrieve the release." }, { status: 502 });
  }
}
