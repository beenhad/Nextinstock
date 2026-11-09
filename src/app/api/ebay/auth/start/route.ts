import { NextResponse } from "next/server";
import { ebayConsentUrl } from "@/lib/server/ebay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const state = crypto.randomUUID();
    const response = NextResponse.redirect(ebayConsentUrl(state));
    response.cookies.set({
      name: "nextinstock_ebay_oauth_state",
      value: state,
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start eBay authorization";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
