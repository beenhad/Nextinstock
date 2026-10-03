import Link from "next/link";
import { paidNextinstockSession, salesConfigured } from "@/lib/server/stripe";

export const dynamic = "force-dynamic";

export default async function PurchaseSuccess({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id: sessionId = "" } = await searchParams;
  let paid = false;
  if (salesConfigured()) {
    try { paid = await paidNextinstockSession(sessionId); } catch { /* Show a safe pending state. */ }
  }
  return <main className="purchase-result site-container">
    <Link href="/">← Nextinstock</Link>
    <h1>{paid ? "Your download is ready." : "We could not confirm this purchase yet."}</h1>
    <p>{paid ? "Download Nextinstock and follow the included local setup guide. Keep this page for access to v1 updates." : "Check your Stripe receipt and return to this page. No download is available until Stripe confirms payment."}</p>
    {paid && <a className="primary-link" href={`/api/download?session_id=${encodeURIComponent(sessionId)}`}>Download Nextinstock</a>}
  </main>;
}
