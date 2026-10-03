import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { deliverCompletedOrder } from "@/lib/server/delivery";
import { liveDeliveryConfigured, stripeClient } from "@/lib/server/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return NextResponse.json({ received: true });
  }
  if (!event.livemode) return NextResponse.json({ received: true, ignored: "sandbox order" });
  if (!liveDeliveryConfigured()) return NextResponse.json({ error: "Live delivery is not configured." }, { status: 503 });

  try {
    await deliverCompletedOrder((event.data.object as Stripe.Checkout.Session).id);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Nextinstock delivery failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Delivery failed; Stripe can retry." }, { status: 500 });
  }
}
