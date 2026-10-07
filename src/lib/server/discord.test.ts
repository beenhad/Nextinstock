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
  const embed = buildWorkerDiscordPayload(result, at)?.embeds?.[0];
  assert.equal(embed?.author?.name, "Restocked");
  assert.equal(embed?.thumbnail?.url, listing.variations[0].imageUrls[0]);
  assert.equal(embed?.color, 0x2ea66f);
  assert.equal(embed?.timestamp, at.toISOString());
  assert.equal(embed?.url, "https://www.ebay.com/itm/123456789");
  assert.deepEqual(embed?.fields?.map((field) => [field.name, field.value, field.inline]), [["Sold", "1", true], ["Available", "1", true]]);
  assert.match(embed?.description ?? "", /last copy lined up/);
  assert.equal(buildWorkerDiscordPayload({ ...result, action: "waiting_for_sale" }), null);
});

test("preview shows every alert state without emoji or eBay changes", () => {
  const at = new Date("2026-10-02T19:30:00.000Z");
  const demo = buildPreviewDiscordPayload(listing, at);
  const connection = buildTestDiscordPayload(at);
  assert.deepEqual(demo.embeds?.map((embed) => embed.author?.name), [
    "Sold", "Sold out · restock lined up", "Restocking", "Restocked", "Restocked",
    "Sold · waiting for your OK", "Out of copies", "Restock ready · test mode", "Restock failed", "Needs review",
  ]);
  assert.ok(demo.embeds?.every((embed) => !/\p{Extended_Pictographic}/u.test(`${embed.author?.name} ${embed.title}`)));
  assert.ok(demo.embeds?.every((embed) => embed.footer?.text.includes("Simulated, eBay not changed")));
  assert.equal(demo.embeds?.[0].thumbnail?.url, listing.imageUrls[0]);
  assert.deepEqual(demo.embeds?.[0].fields?.map((field) => field.value), ["1 → 2", "1 → 0", "5 photos"]);
  assert.match(demo.embeds?.[0].description ?? "", /Next copy goes up <t:\d+:R>/);
  assert.match(demo.embeds?.[5].description ?? "", /\[Put it up\]\(http:\/\/127\.0\.0\.1:3000\/tool\?approve=/);
  assert.match(demo.embeds?.[6].description ?? "", /No copies left in line/);
  assert.match(demo.embeds?.[4].description ?? "", /last copy lined up/);
  assert.equal(connection.embeds?.[0].timestamp, at.toISOString());
  assert.equal(connection.embeds?.[0].color, 0x3155f5);
});

test("sale alert shows the change, when the next copy goes up, and what it is", () => {
  const scheduledFor = "2026-10-02T19:31:00.000Z";
  const plan = {
    variationKey: null,
    copy: { id: "copy-1", internalReference: "GC-SONIC-POSTER-02", photoCount: 8, targetPrice: 86.99 },
    trigger: { armedQuantitySold: 2, currentQuantitySold: 2, currentQuantityAvailable: 0 },
  } as WorkerResult["plan"];
  const embed = buildWorkerDiscordPayload({
    taskId: "task-1", action: "restock_scheduled", message: "Sale observed", listing: { ...listing, quantitySold: 2, quantityAvailable: 0, variations: [] }, plan, scheduledFor,
    trigger: { kind: "new_sale", previousSold: 1, previousAvailable: 1 },
  })?.embeds?.[0];
  assert.equal(embed?.author?.name, "Sold");
  assert.equal(embed?.color, 0x2ea66f);
  assert.deepEqual(embed?.fields?.map((field) => [field.name, field.value]), [["Sold", "1 → 2"], ["Available", "1 → 0"], ["Next copy", "$86.99 · 8 photos"]]);
  assert.equal(embed?.description, `Next copy goes up <t:${Date.parse(scheduledFor) / 1000}:R>.`);
  assert.equal(embed?.footer?.text, "eBay 123456789");
});

test("preview uses a valid product thumbnail and keeps long titles compact", () => {
  const demo = buildPreviewDiscordPayload({
    ...listing,
    title: "An extremely long collectible product title with specifications that should not turn the alert into a paragraph",
    imageUrls: ["https://example.com/not-a-product.jpg", listing.imageUrls[0]],
  });
  assert.equal(demo.embeds?.[0].thumbnail?.url, listing.imageUrls[0]);
  assert.ok((demo.embeds?.[0].title ?? "").length < 80);
});
