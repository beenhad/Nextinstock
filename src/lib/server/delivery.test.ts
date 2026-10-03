import assert from "node:assert/strict";
import { test } from "node:test";
import type Stripe from "stripe";
import { deliveryEmailContent, sendDeliveryEmail } from "./delivery";

test("delivery email includes the protected order link, amount, setup step, and support address", () => {
  const session = { id: "cs_live_example", currency: "usd", amount_total: 0 } as Stripe.Checkout.Session;
  const email = deliveryEmailContent(session, "https://nextinstock.com", "nextinstock@grayshapes.com");
  assert.match(email.subject, /Nextinstock Desktop/);
  assert.match(email.text, /Order total: \$0\.00/);
  assert.match(email.text, /https:\/\/nextinstock\.com\/purchase\/success\?session_id=cs_live_example/);
  assert.match(email.html, /View order and download/);
  assert.match(email.html, /nextinstock@grayshapes\.com/);
  assert.match(email.text, /setup guide/);
});

test("delivery request addresses the checkout buyer and uses a stable retry key", async () => {
  const session = {
    id: "cs_live_example", currency: "usd", amount_total: 9900,
    customer_details: { email: "buyer@example.com" },
  } as unknown as Stripe.Checkout.Session;
  const emailId = await sendDeliveryEmail(session, {
    apiKey: "re_test", from: "Nextinstock <nextinstock@grayshapes.com>",
    supportEmail: "nextinstock@grayshapes.com", publicUrl: "https://nextinstock.com",
  }, async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    const headers = new Headers(options?.headers);
    assert.equal(headers.get("Idempotency-Key"), "nextinstock-delivery-cs_live_example");
    assert.equal(headers.get("Authorization"), "Bearer re_test");
    const payload = JSON.parse(String(options?.body));
    assert.deepEqual(payload.to, ["buyer@example.com"]);
    assert.equal(payload.reply_to, "nextinstock@grayshapes.com");
    assert.match(payload.text, /View your order and download for Mac/);
    return Response.json({ id: "email_example" });
  });
  assert.equal(emailId, "email_example");
});
