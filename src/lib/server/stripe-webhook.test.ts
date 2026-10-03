import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import Stripe from "stripe";
import { POST } from "../../app/api/stripe/webhook/route";

const savedKey = process.env.STRIPE_SECRET_KEY;
const savedSecret = process.env.STRIPE_WEBHOOK_SECRET;
afterEach(() => {
  if (savedKey === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = savedKey;
  if (savedSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = savedSecret;
});

test("Stripe webhook rejects a bad signature and acknowledges a signed sandbox order without delivery", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_example";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_example";
  const payload = JSON.stringify({
    id: "evt_test_example", object: "event", type: "checkout.session.completed", livemode: false,
    data: { object: { id: "cs_test_example" } },
  });
  const bad = await POST(new Request("https://nextinstock.com/api/stripe/webhook", {
    method: "POST", headers: { "stripe-signature": "bad" }, body: payload,
  }));
  assert.equal(bad.status, 400);

  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_example" });
  const good = await POST(new Request("https://nextinstock.com/api/stripe/webhook", {
    method: "POST", headers: { "stripe-signature": signature }, body: payload,
  }));
  assert.equal(good.status, 200);
  assert.deepEqual(await good.json(), { received: true, ignored: "sandbox order" });

  const livePayload = payload.replace('"livemode":false', '"livemode":true');
  const liveSignature = Stripe.webhooks.generateTestHeaderString({ payload: livePayload, secret: "whsec_example" });
  const unconfiguredLive = await POST(new Request("https://nextinstock.com/api/stripe/webhook", {
    method: "POST", headers: { "stripe-signature": liveSignature }, body: livePayload,
  }));
  assert.equal(unconfiguredLive.status, 503);
});
