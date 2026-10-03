import { NextResponse } from "next/server";
import { fetchEbayProfile } from "@/lib/server/ebay-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ profile: await fetchEbayProfile() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load eBay profile" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
