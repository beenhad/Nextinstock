import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type Stripe from "stripe";
import { checkoutMode, isCompletedDesktopOrder, liveDownloadConfigured } from "./stripe";

const names = ["NEXTINSTOCK_TEST_CHECKOUT_ENABLED", "NEXTINSTOCK_SALES_ENABLED", "STRIPE_SECRET_KEY", "STRIPE_DESKTOP_PRICE_ID", "STRIPE_DESKTOP_OFFER_PRICE_ID", "NEXTINSTOCK_DESKTOP_OFFER_TOTAL", "NEXTINSTOCK_DESKTOP_OFFER_REMAINING", "NEXTINSTOCK_PUBLIC_URL", "NEXTINSTOCK_RELEASE_URL", "BLOB_READ_WRITE_TOKEN", "STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY", "NEXTINSTOCK_DELIVERY_FROM", "NEXTINSTOCK_SUPPORT_EMAIL"] as const;
const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of names) {
    const value = saved[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("Desktop checkout requires an explicit test gate, test key, and Price ID", () => {
  for (const name of names) delete process.env[name];
  process.env.STRIPE_SECRET_KEY = "sk_test_example";
  process.env.STRIPE_DESKTOP_PRICE_ID = "price_example";
  process.env.NEXTINSTOCK_PUBLIC_URL = "http://127.0.0.1:3000";
  assert.equal(checkoutMode(), null);
  process.env.NEXTINSTOCK_TEST_CHECKOUT_ENABLED = "true";
  assert.equal(checkoutMode(), "test");
  process.env.STRIPE_SECRET_KEY = "sk_live_example";
  assert.equal(checkoutMode(), null);
});

test("live sales require release and email delivery, while existing downloads survive a sales pause", () => {
  for (const name of names) delete process.env[name];
  process.env.NEXTINSTOCK_SALES_ENABLED = "true";
  process.env.STRIPE_SECRET_KEY = "sk_live_example";
  process.env.STRIPE_DESKTOP_PRICE_ID = "price_example";
  process.env.NEXTINSTOCK_PUBLIC_URL = "https://example.com";
  assert.equal(checkoutMode(), null);
  process.env.NEXTINSTOCK_RELEASE_URL = "https://example.com/release.zip";
  assert.equal(liveDownloadConfigured(), true);
  process.env.NEXTINSTOCK_RELEASE_URL = "https://store.private.blob.vercel-storage.com/release.zip";
  assert.equal(liveDownloadConfigured(), false);
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_token";
  assert.equal(liveDownloadConfigured(), true);
  process.env.NEXTINSTOCK_RELEASE_URL = "https://not a valid URL";
  assert.equal(liveDownloadConfigured(), false);
  process.env.NEXTINSTOCK_RELEASE_URL = "https://example.com/release.zip";
  assert.equal(checkoutMode(), null);
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_example";
  process.env.RESEND_API_KEY = "re_example";
  process.env.NEXTINSTOCK_DELIVERY_FROM = "Nextinstock <nextinstock@grayshapes.com>";
  process.env.NEXTINSTOCK_SUPPORT_EMAIL = "nextinstock@grayshapes.com";
  assert.equal(checkoutMode(), "live");
  process.env.STRIPE_SECRET_KEY = "rk_live_example";
  assert.equal(checkoutMode(), "live");
  process.env.NEXTINSTOCK_SALES_ENABLED = "false";
  assert.equal(checkoutMode(), null);
  assert.equal(liveDownloadConfigured(), true);
});

test("completed paid and zero-total orders qualify; unpaid and incomplete sessions do not", () => {
  const session = {
    mode: "payment", status: "complete", payment_status: "paid", amount_total: 9900,
    metadata: { product: "nextinstock-desktop-v1" },
  } as unknown as Stripe.Checkout.Session;
  assert.equal(isCompletedDesktopOrder(session), true);
  assert.equal(isCompletedDesktopOrder({ ...session, payment_status: "no_payment_required", amount_total: 0 }), true);
  assert.equal(isCompletedDesktopOrder({ ...session, payment_status: "no_payment_required" }), false);
  assert.equal(isCompletedDesktopOrder({ ...session, payment_status: "unpaid" }), false);
  assert.equal(isCompletedDesktopOrder({ ...session, status: "open" }), false);
  assert.equal(isCompletedDesktopOrder({ ...session, metadata: { product: "other" } }), false);
});
