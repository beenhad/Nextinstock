import assert from "node:assert/strict";
import test from "node:test";
import type { ListingSnapshot, WorkerResult } from "@/lib/types";
import { buildPreviewDiscordPayload, buildTestDiscordPayload, buildWorkerDiscordPayload, validateDiscordWebhookUrl } from "./discord";

test("accepts only Discord incoming webhook URLs", () => {
  assert.equal(validateDiscordWebhookUrl("https://discord.com/api/webhooks/123/abc_DEF"), "https://discord.com/api/webhooks/123/abc_DEF");
  assert.throws(() => validateDiscordWebhookUrl("https://example.com/api/webhooks/123/abc_DEF"));
  assert.throws(() => validateDiscordWebhookUrl("http://discord.com/api/webhooks/123/abc_DEF"));
  assert.throws(() => validateDiscordWebhookUrl("https://discord.com/api/webhooks/123/abc_DEF?redirect=https://example.com"));
});

const listing: ListingSnapshot = {
  itemId: "123456789",
  sku: null,
  title: "Test game",
  listingUrl: "https://www.ebay.com/itm/123456789",
  listingType: "FixedPriceItem",
  listingStatus: "Active",
  listingDuration: "GTC",
  conditionId: "3000",
  conditionName: "Used",
  conditionDescription: null,
  price: 25,
  currency: "USD",
  quantityTotal: 2,
  quantitySold: 1,
  quantityAvailable: 1,
  imageUrls: ["https://i.ebayimg.com/images/g/listing/s-l500.jpg"],
  variationCount: 1,
  variations: [{
    key: "blue",
    sku: null,
    specifics: [{ name: "Color", value: "Blue" }],
    label: "Color: Blue",
    price: 25,
    currency: "USD",
    quantityTotal: 2,
    quantitySold: 1,
    quantityAvailable: 1,
    imageUrls: ["https://i.ebayimg.com/images/g/blue/s-l500.jpg"],
    hasSpecificPhotos: true,
  }],
  variationPictureAxis: "Color",
  outOfStockControl: true,
  supported: true,
  unsupportedReasons: [],
  fetchedAt: "2026-10-02T19:00:00.000Z",
};

test("worker alerts use product thumbnail, status color, and event timestamp", () => {
  const at = new Date("2026-10-02T19:30:00.000Z");
  const result: WorkerResult = {
    taskId: "task-1",
    action: "restocked",
    message: "confirmed",
    listing,
    plan: { variationKey: "blue" } as WorkerResult["plan"],
    remainingQueuedCopies: 0,
  };
  const payload = buildWorkerDiscordPayload(result, at);
  assert.equal(payload?.username, "Next");
  assert.equal(payload?.embeds?.[0].thumbnail?.url, listing.variations[0].imageUrls[0]);
  assert.equal(payload?.embeds?.[0].color, 0x2ea66f);
  assert.equal(payload?.embeds?.[0].timestamp, at.toISOString());
  assert.equal(payload?.embeds?.[0].fields?.[0].value, "1");
  assert.equal(payload?.embeds?.[0].fields?.[1].value, "1");
  assert.equal(payload?.embeds?.[0].fields?.[0].name, "SOLD");
  assert.equal(payload?.embeds?.[0].fields?.[1].name, "AVAILABLE");
  assert.equal(payload?.embeds?.[0].fields?.[0].inline, false);
  assert.equal(payload?.embeds?.[0].fields?.[1].inline, false);
  assert.equal(payload?.embeds?.[0].fields?.[2].name, "NEXT ACTION");
  assert.match(payload?.embeds?.[0].fields?.[2].value ?? "", /No other copies are queued/);
  assert.match(payload?.embeds?.[0].description ?? "", /https:\/\/www\.ebay\.com\/itm\/123456789/);
  assert.equal(buildWorkerDiscordPayload({ ...result, action: "waiting_for_sale" }), null);
});

test("preview shows every alert state without changing eBay", () => {
  const at = new Date("2026-10-02T19:30:00.000Z");
  const demo = buildPreviewDiscordPayload(listing, at);
  const connection = buildTestDiscordPayload(at);
  assert.deepEqual(demo.embeds?.map((embed) => embed.title), [
    "🟢 NEW SALE", "🟢 AWAITING RESTOCK", "🔵 RESTOCKING", "🟢 RESTOCKED",
    "🟢 RESTOCKED", "🟡 SOLD · WAITING FOR YOUR OK", "🟠 RESTOCK ON HOLD", "🔵 RESTOCK READY · DRY RUN", "🔴 RESTOCK NEEDS ATTENTION", "🟠 RESTOCK NEEDS REVIEW",
  ]);
  assert.match(demo.embeds?.[0].footer?.text ?? "", /PREVIEW.*No eBay change/);
  assert.equal(demo.embeds?.[0].thumbnail?.url, listing.imageUrls[0]);
  assert.equal(demo.embeds?.[0].color, 0x2ea66f);
  assert.equal(demo.embeds?.[0].fields?.[0].value, "1 → 2");
  assert.equal(demo.embeds?.[0].fields?.[1].value, "1 → 0");
  assert.match(demo.embeds?.[0].fields?.[2].value ?? "", /Awaiting restock/);
  assert.match(demo.embeds?.[5].fields?.[2].value ?? "", /Approve the restock\]\(http:\/\/127\.0\.0\.1:3000\/tool\?approve=/);
  assert.match(demo.embeds?.[6].fields?.[2].value ?? "", /No next copy queued/);
  assert.match(demo.embeds?.[4].fields?.[2].value ?? "", /No other copies are queued/);
  assert.ok(demo.embeds?.every((embed) => embed.footer?.text.includes("Simulated · No eBay change")));
  assert.ok((demo.embeds?.[0].description ?? "").length < 110);
  assert.equal(connection.embeds?.[0].timestamp, at.toISOString());
  assert.equal(connection.embeds?.[0].color, 0x3155f5);
});

test("scheduled sale alert gives a relative eligibility time and exact restock steps", () => {
  const scheduledFor = "2026-10-02T19:31:00.000Z";
  const plan = {
    variationKey: null,
    copy: { id: "copy-1", internalReference: "GC-SONIC-POSTER-02", photoCount: 8, targetPrice: null },
    trigger: { armedQuantitySold: 2, currentQuantitySold: 2, currentQuantityAvailable: 0 },
  } as WorkerResult["plan"];
  const payload = buildWorkerDiscordPayload({
    taskId: "task-1", action: "restock_scheduled", message: "Sale observed", listing: { ...listing, quantitySold: 2, quantityAvailable: 0, variations: [] }, plan, scheduledFor,
    trigger: { kind: "new_sale", previousSold: 1, previousAvailable: 1 },
  });
  const embed = payload?.embeds?.[0];
  assert.equal(embed?.title, "🟢 NEW SALE");
  assert.equal(embed?.color, 0x2ea66f);
  assert.deepEqual(embed?.fields?.map((field) => field.name), ["SOLD", "AVAILABLE", "NEXT ACTION"]);
  assert.equal(embed?.fields?.[0].value, "1 → 2");
  assert.equal(embed?.fields?.[1].value, "1 → 0");
  assert.match(embed?.fields?.[2].value ?? "", new RegExp(`<t:${Date.parse(scheduledFor) / 1000}:R>`));
  assert.match(embed?.fields?.[2].value ?? "", /GC-SONIC-POSTER-02 · 8 photos \+ condition → verify at 0 → publish 1/);
  assert.match(embed?.footer?.text ?? "", /Trigger 2 sold \/ 0 available/);
});

test("preview uses a valid product thumbnail and keeps long titles compact", () => {
  const demo = buildPreviewDiscordPayload({
    ...listing,
    title: "An extremely long collectible product title with specifications that should not turn the alert into a paragraph",
    imageUrls: ["https://example.com/not-a-product.jpg", listing.imageUrls[0]],
  });
  assert.equal(demo.embeds?.[0].thumbnail?.url, listing.imageUrls[0]);
  assert.match(demo.embeds?.[0].title ?? "", /NEW SALE/);
  assert.ok((demo.embeds?.[0].description ?? "").length < 125);
});
