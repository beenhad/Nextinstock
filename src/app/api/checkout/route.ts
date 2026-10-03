import { NextResponse } from "next/server";
import { desktopPriceId, salesConfigured, stripeClient } from "@/lib/server/stripe";

export const runtime = "nodejs";

export async function POST() {
  if (!salesConfigured()) return NextResponse.json({ error: "Purchasing is not open yet." }, { status: 503 });
  const publicUrl = new URL(process.env.NEXTINSTOCK_PUBLIC_URL!);
  if (publicUrl.protocol !== "https:" && publicUrl.hostname !== "localhost") {
    return NextResponse.json({ error: "The store URL is not configured securely." }, { status: 503 });
  }
  const session = await stripeClient().checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: desktopPriceId()!, quantity: 1 }],
    metadata: { product: "nextinstock-desktop-v1" },
    success_url: `${publicUrl.origin}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${publicUrl.origin}/#pricing`,
  });
  if (!session.url) return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 502 });
  return NextResponse.json({ url: session.url }, { headers: { "Cache-Control": "no-store" } });
}
