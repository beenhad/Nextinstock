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

export function liveDownloadConfigured(): boolean {
  if (!/^(?:sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "")) return false;
  try {
    const publicUrl = new URL(process.env.NEXTINSTOCK_PUBLIC_URL!);
    const releaseUrl = new URL(process.env.NEXTINSTOCK_RELEASE_URL!);
    if (releaseUrl.hostname.endsWith(".private.blob.vercel-storage.com") && !process.env.BLOB_READ_WRITE_TOKEN) return false;
    return publicUrl.protocol === "https:" && releaseUrl.protocol === "https:";
  } catch { return false; }
}

export function liveDeliveryConfigured(): boolean {
  return liveDownloadConfigured() && Boolean(process.env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_") &&
    process.env.RESEND_API_KEY && process.env.NEXTINSTOCK_DELIVERY_FROM &&
    process.env.NEXTINSTOCK_SUPPORT_EMAIL);
}

export function salesConfigured(): boolean {
  return process.env.NEXTINSTOCK_SALES_ENABLED === "true" &&
    liveDeliveryConfigured() && Boolean(desktopPriceId()?.startsWith("price_"));
}

export function checkoutMode(): "live" | "test" | null {
  if (salesConfigured()) return "live";
  if (process.env.NEXTINSTOCK_TEST_CHECKOUT_ENABLED !== "true" ||
    !process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ||
    !desktopPriceId()?.startsWith("price_") || !process.env.NEXTINSTOCK_PUBLIC_URL) return null;
  try {
    const url = new URL(process.env.NEXTINSTOCK_PUBLIC_URL);
    return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1" ? "test" : null;
  } catch { return null; }
}

export function isCompletedDesktopOrder(session: Stripe.Checkout.Session): boolean {
  return session.mode === "payment" && session.status === "complete" &&
    session.metadata?.product === "nextinstock-desktop-v1" &&
    (session.payment_status === "paid" ||
      (session.payment_status === "no_payment_required" && session.amount_total === 0));
}

export async function completedNextinstockSession(sessionId: string): Promise<Stripe.Checkout.Session | null> {
  if (!/^cs_(?:test_|live_)[A-Za-z0-9]+$/.test(sessionId)) return null;
  const session = await stripeClient().checkout.sessions.retrieve(sessionId);
  return isCompletedDesktopOrder(session) ? session : null;
}
