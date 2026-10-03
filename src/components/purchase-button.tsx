"use client";

import { useState } from "react";

export function PurchaseButton({ enabled, price }: { enabled: boolean; price: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function startCheckout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/checkout", { method: "POST" });
      const payload = await response.json() as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error ?? "Checkout is unavailable.");
      window.location.assign(payload.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Checkout is unavailable.");
      setBusy(false);
    }
  }
  return <div className="purchase-action">
    <button className="primary-link" type="button" disabled={!enabled || busy} onClick={() => void startCheckout()}>{enabled ? busy ? "Opening Stripe…" : `Buy Desktop — ${price}` : "Desktop coming soon"}</button>
    {error && <small role="alert">{error}</small>}
  </div>;
}
