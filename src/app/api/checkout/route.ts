import { NextResponse } from "next/server";
import { checkoutMode, desktopPriceId, stripeClient } from "@/lib/server/stripe";

export const runtime = "nodejs";

export async function POST() {
  if (!checkoutMode()) return NextResponse.json({ error: "Checkout is not configured yet." }, { status: 503 });
  const publicUrl = new URL(process.env.NEXTINSTOCK_PUBLIC_URL!);
  if (publicUrl.protocol !== "https:" && publicUrl.hostname !== "localhost" && publicUrl.hostname !== "127.0.0.1") {
    return NextResponse.json({ error: "The store URL is not configured securely." }, { status: 503 });
  }
  const session = await stripeClient().checkout.sessions.create({
    mode: "payment",
    allowed_payment_method_types: ["card"],
    line_items: [{ price: desktopPriceId()!, quantity: 1 }],
    metadata: { product: "nextinstock-desktop-v1" },
    allow_promotion_codes: process.env.NEXTINSTOCK_PROMO_CODES_ENABLED === "true",
    branding_settings: {
      display_name: "Nextinstock by grayshapes",
      background_color: "#FFFFFF",
      button_color: "#3155F5",
      border_style: "rounded",
      ...(process.env.STRIPE_CHECKOUT_ICON_FILE_ID?.startsWith("file_")
        ? { icon: { type: "file" as const, file: process.env.STRIPE_CHECKOUT_ICON_FILE_ID } }
        : {}),
    },
    custom_text: {
      submit: { message: checkoutMode() === "test"
        ? "Sandbox checkout. No real charge or download will be sent."
        : "Your Mac download will be ready after checkout. We will email a copy of the download link." },
    },
    success_url: `${publicUrl.origin}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${publicUrl.origin}/#pricing`,
  });
  if (!session.url) return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 502 });
  return NextResponse.json({ url: session.url }, { headers: { "Cache-Control": "no-store" } });
}
