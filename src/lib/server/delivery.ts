import type Stripe from "stripe";
import { completedNextinstockSession, liveDeliveryConfigured, stripeClient } from "./stripe";

export function deliveryEmailContent(session: Stripe.Checkout.Session, origin: string, supportEmail: string) {
  const orderUrl = new URL(`/purchase/success?session_id=${encodeURIComponent(session.id)}`, origin).toString();
  const total = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (session.currency ?? "usd").toUpperCase(),
  }).format((session.amount_total ?? 0) / 100);
  const supportUrl = `mailto:${encodeURIComponent(supportEmail)}`;
  const safeSupportEmail = supportEmail.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  const subject = "Your Nextinstock Desktop download";
  const text = `Your Nextinstock Desktop order is ready.\n\nOrder total: ${total}\n\nView your order and download for Mac: ${orderUrl}\n\nKeep this email to return to your download. The ZIP includes the setup guide.\n\nNeed help? Reply to this email or contact ${supportEmail}.\n\nNextinstock by grayshapes`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f7f7f7;color:#191919;font-family:Arial,Helvetica,sans-serif"><div style="max-width:560px;margin:0 auto;padding:40px 20px"><div style="font-size:21px;font-weight:700;letter-spacing:-.04em;color:#3155f5">next<span style="color:#191919">instock</span></div><div style="margin-top:24px;padding:32px;background:#fff;border:1px solid #e5e5e5;border-radius:16px"><p style="margin:0;color:#707070;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Desktop for Mac</p><h1 style="margin:14px 0 12px;font-size:29px;line-height:1.2;letter-spacing:-.04em">Your download is ready.</h1><p style="margin:0 0 24px;font-size:16px;line-height:1.6">Your Nextinstock Desktop order is complete. Download the ZIP and follow the included setup guide.</p><a href="${orderUrl}" style="display:inline-block;padding:14px 20px;border-radius:9px;background:#3155f5;color:#fff;font-size:15px;font-weight:700;text-decoration:none">View order and download</a><p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #e5e5e5;color:#707070;font-size:14px">Order total: <strong style="color:#191919">${total}</strong></p></div><p style="margin:20px 2px 0;color:#707070;font-size:13px;line-height:1.6">Keep this email to return to your download. Need help? <a href="${supportUrl}" style="color:#3155f5">${safeSupportEmail}</a>.</p><p style="margin:12px 2px 0;color:#707070;font-size:12px">Nextinstock by grayshapes</p></div></body></html>`;
  return { subject, text, html, orderUrl };
}

export async function sendDeliveryEmail(
  session: Stripe.Checkout.Session,
  settings: { apiKey: string; from: string; supportEmail: string; publicUrl: string },
  send: typeof fetch = fetch,
): Promise<string | null> {
  const to = session.customer_details?.email ?? session.customer_email;
  if (!to) throw new Error("Checkout did not provide a customer email");
  const { subject, html, text } = deliveryEmailContent(session, settings.publicUrl, settings.supportEmail);
  const response = await send("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `nextinstock-delivery-${session.id}`,
    },
    body: JSON.stringify({ from: settings.from, to: [to], reply_to: settings.supportEmail, subject, html, text }),
  });
  if (!response.ok) throw new Error(`Delivery email failed with HTTP ${response.status}`);
  const result = await response.json() as { id?: string };
  return result.id ?? null;
}

export async function deliverCompletedOrder(sessionId: string): Promise<void> {
  if (!liveDeliveryConfigured()) throw new Error("Live delivery is not configured");
  const session = await completedNextinstockSession(sessionId);
  if (!session || !session.livemode) throw new Error("A completed live Desktop order is required");
  if (session.metadata?.delivery_email_sent === "true") return;

  const emailId = await sendDeliveryEmail(session, {
    apiKey: process.env.RESEND_API_KEY!,
    from: process.env.NEXTINSTOCK_DELIVERY_FROM!,
    supportEmail: process.env.NEXTINSTOCK_SUPPORT_EMAIL!,
    publicUrl: process.env.NEXTINSTOCK_PUBLIC_URL!,
  });
  await stripeClient().checkout.sessions.update(session.id, {
    metadata: {
      ...session.metadata,
      delivery_email_sent: "true",
      ...(emailId ? { delivery_email_id: emailId } : {}),
    },
  });
}
