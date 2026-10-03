# Stripe handoff

The pricing page presents two planned offers: Desktop at $99 once ($49 during a configured launch offer) and Cloud at $9.99 per month. Each is described as supporting up to 10 active listing or variation targets. The target cap is not enforced yet, so sales must remain disabled.

Local preview shows an **example** Desktop launch meter with 10 total spots and 3 remaining. Hosted pages show the meter only when a valid real count is configured. Do not publish a guessed or stale spot count.

Create separate Stripe products and test-mode Prices for Desktop and Cloud. Record both `price_...` IDs, their amounts, and which Stripe mode they belong to. `prod_...` IDs cannot be used as Checkout line-item Prices.

## Desktop checkout

Only Desktop has a Checkout path today. It stays disabled until `NEXTINSTOCK_SALES_ENABLED=true` and these values are set on the hosted marketing deployment:

- `STRIPE_SECRET_KEY`: server-only Stripe key for the same mode as the Price.
- `STRIPE_DESKTOP_PRICE_ID`: the one-time Desktop Price ID.
- `NEXTINSTOCK_DESKTOP_OFFER_TOTAL` and `NEXTINSTOCK_DESKTOP_OFFER_REMAINING`: optional real launch inventory counts. Both must be integers, and remaining must be between zero and total.
- `STRIPE_DESKTOP_OFFER_PRICE_ID`: the $49 one-time Price on the Desktop product. Required if the launch count is configured with spots remaining; Checkout then selects this Price. At zero remaining, Checkout selects `STRIPE_DESKTOP_PRICE_ID` and shows $99.
- `NEXTINSTOCK_PUBLIC_URL`: canonical HTTPS marketing origin.
- `NEXTINSTOCK_RELEASE_URL`: HTTPS URL for the reviewed Desktop release ZIP, fetched server-side only after Stripe confirms payment.

The Checkout route creates a Stripe-hosted one-time session with a server-selected Price and Desktop metadata. The success page and download route independently retrieve the session and require `payment_status=paid`. The download route proxies the ZIP without displaying the asset URL. The remaining count is currently manual; it does not reserve a spot or decrement itself after payment.

Before turning Desktop sales on: enforce the advertised target cap; complete the controlled live eBay handoff; test Stripe success, cancellation, failed payment, and download denial; verify the release on a clean Mac account; set up fulfillment email for customers who close the success page; review tax, refund, update, and support terms. The current release is a source ZIP that requires Node and the buyer's own eBay developer credentials.

## Cloud checkout

The Cloud Price is for future subscription checkout. There is no Cloud purchase route, signup, entitlement, customer portal, hosted worker, or durable hosted storage yet. The Cloud button stays disabled. Add and verify those pieces, including webhook-based subscription state, before enabling Cloud sales.
