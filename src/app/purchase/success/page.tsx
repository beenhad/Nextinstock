import Link from "next/link";
import { checkoutMode, completedNextinstockSession, liveDownloadConfigured } from "@/lib/server/stripe";

export const dynamic = "force-dynamic";

export default async function PurchaseSuccess({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id: sessionId = "" } = await searchParams;
  const mode = checkoutMode() ?? (liveDownloadConfigured() ? "live" : null);
  const supportEmail = process.env.NEXTINSTOCK_SUPPORT_EMAIL ?? "nextinstock@grayshapes.com";
  let completed = false;
  if (mode) {
    try { completed = Boolean(await completedNextinstockSession(sessionId)); } catch { /* Show the pending state. */ }
  }
  const liveOrder = completed && mode === "live";

  return <main className="purchase-result site-container">
    <Link className="purchase-result-back" href="/">← Nextinstock</Link>
    <section className="purchase-result-card">
      <div className="purchase-result-symbol" aria-hidden="true">{completed ? "✓" : "…"}</div>
      <span className="purchase-result-label">Nextinstock Desktop · Mac</span>
      <h1>{liveOrder ? "Your download is ready." : completed ? "Test checkout complete." : "Order confirmation is pending."}</h1>
      <p>{liveOrder
        ? "Your order is complete. Download the ZIP and follow its setup guide. A copy of your download link will be sent to the email you used at checkout."
        : completed
          ? "Stripe confirmed this sandbox order. No real charge was made, and no download or delivery email was sent."
          : "If you just finished checkout, wait a moment and refresh this page. The download appears only after Stripe confirms your order."}</p>
      {liveOrder && <>
        <a className="primary-link" href={`/api/download?session_id=${encodeURIComponent(sessionId)}`}>Download for Mac</a>
        <div className="purchase-result-next">
          <strong>After downloading</strong>
          <span>Open the ZIP, then follow the included guide or <Link href="/docs">read the online setup docs</Link> to connect your eBay account.</span>
        </div>
      </>}
      {!completed && <a className="purchase-result-refresh" href={`/purchase/success?session_id=${encodeURIComponent(sessionId)}`}>Refresh order status</a>}
    </section>
    <p className="purchase-result-help">Need help? <a href={`mailto:${supportEmail}`}>Email {supportEmail}</a>.</p>
  </main>;
}
