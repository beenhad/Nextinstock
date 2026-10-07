// Prints the three Discord alerts shown in the landing page clip, built by the real alert code.
import { buildWorkerDiscordPayload } from "../src/lib/server/discord";
import type { WorkerResult } from "../src/lib/types";

const at = new Date();
const listing = {
  itemId: "306012345678", sku: null, title: "Pokémon XD: Gale of Darkness Nintendo GameCube Complete CIB",
  listingUrl: "https://www.ebay.com/itm/306012345678", listingType: "FixedPriceItem", listingStatus: "Active", listingDuration: "GTC",
  conditionId: "3000", conditionName: "Good", conditionDescription: "", price: 84.99, currency: "USD",
  quantityTotal: 9, quantitySold: 9, quantityAvailable: 0, imageUrls: ["https://i.ebayimg.com/images/g/demo/s-l500.jpg"],
  variationCount: 0, variations: [], variationPictureAxis: null, outOfStockControl: true, supported: true, unsupportedReasons: [], fetchedAt: at.toISOString(),
} as unknown as WorkerResult["listing"];
const plan = {
  taskId: "demo", itemId: listing.itemId, variationKey: null, writeMode: "live",
  trigger: { armedQuantitySold: 9, currentQuantitySold: 9, currentQuantityAvailable: 0 },
  copy: { id: "c1", internalReference: "PKXD-011", conditionId: "3000", conditionDescription: "", photoCount: 5, targetPrice: 89.99 },
  mutation: {}, blockers: [],
} as unknown as WorkerResult["plan"];
const sale = { kind: "new_sale", previousSold: 8, previousAvailable: 1 } as WorkerResult["trigger"];
const results: WorkerResult[] = [
  { taskId: "demo", action: "restock_scheduled", message: "", listing, plan, trigger: sale, scheduledFor: new Date(at.getTime() + 60_000).toISOString() } as WorkerResult,
  { taskId: "demo", action: "awaiting_approval", message: "", listing, plan, trigger: sale } as WorkerResult,
  { taskId: "demo", action: "restocked", message: "", listing: { ...listing, quantityAvailable: 1 }, plan, remainingQueuedCopies: 1 } as WorkerResult,
];
console.log(JSON.stringify(results.map((result) => buildWorkerDiscordPayload(result, at)!.embeds![0])));
