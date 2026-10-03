import { NextResponse } from "next/server";
import { defaultItemId } from "@/lib/server/config";
import { upsertListing } from "@/lib/server/database";
import { fetchListing } from "@/lib/server/ebay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const itemId = url.searchParams.get("itemId")?.trim() || defaultItemId();
  if (!itemId) return NextResponse.json({ error: "Enter an eBay item ID first." }, { status: 400 });
  try {
    const listing = await fetchListing(itemId);
    upsertListing(listing);
    return NextResponse.json(
      { listing },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not fetch the eBay listing";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
