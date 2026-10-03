import Stripe from "stripe";

export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured");
  return new Stripe(key);
}

export function desktopOfferStatus(): { total: number; remaining: number } | null {
  const totalRaw = process.env.NEXTINSTOCK_DESKTOP_OFFER_TOTAL;
  const remainingRaw = process.env.NEXTINSTOCK_DESKTOP_OFFER_REMAINING;
  if (!totalRaw || !remainingRaw || !/^\d+$/.test(totalRaw) || !/^\d+$/.test(remainingRaw)) return null;
  const total = Number(totalRaw);
  const remaining = Number(remainingRaw);
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(remaining) || total < 1 || remaining > total) return null;
  return { total, remaining };
}

export function desktopPriceId(): string | undefined {
  const offer = desktopOfferStatus();
  return offer && offer.remaining > 0
    ? process.env.STRIPE_DESKTOP_OFFER_PRICE_ID
    : process.env.STRIPE_DESKTOP_PRICE_ID;
}

export function salesConfigured(): boolean {
  return process.env.NEXTINSTOCK_SALES_ENABLED === "true" &&
    Boolean(process.env.STRIPE_SECRET_KEY && desktopPriceId() &&
      process.env.NEXTINSTOCK_PUBLIC_URL && process.env.NEXTINSTOCK_RELEASE_URL);
}

export async function paidNextinstockSession(sessionId: string): Promise<boolean> {
  if (!/^cs_(?:test_|live_)[A-Za-z0-9]+$/.test(sessionId)) return false;
  const session = await stripeClient().checkout.sessions.retrieve(sessionId);
  return session.mode === "payment" && session.payment_status === "paid" &&
    session.metadata?.product === "nextinstock-desktop-v1";
}
