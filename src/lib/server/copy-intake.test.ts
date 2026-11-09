import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import sharp from "sharp";
import { POST as create } from "../../app/api/tasks/route";
import { POST as append } from "../../app/api/tasks/[taskId]/copies/route";
import { createTask, getTask } from "./database";
import { fetchListing } from "./ebay";

const directory = mkdtempSync(path.join(os.tmpdir(), "nextinstock-intake-"));
process.env.NEXTINSTOCK_DATA_DIR = directory;
process.env.EBAY_APP_ID = "fixture";
process.env.EBAY_CERT_ID = "fixture";
process.env.EBAY_REFRESH_TOKEN = "fixture-intake";
process.env.SELLERMAID_ENV_FILE = "";
const savedFetch = globalThis.fetch;
after(() => { globalThis.fetch = savedFetch; rmSync(directory, { recursive: true, force: true }); });
let providerReads = 0;
globalThis.fetch = async (url, options) => {
  if (String(url).includes("oauth2/token")) return Response.json({ access_token: "fixture", expires_in: 7200 });
  const call = new Headers(options?.headers).get("X-EBAY-API-CALL-NAME");
  if (call === "GetUserPreferences") return new Response("<Ack>Success</Ack><OutOfStockControlPreference>true</OutOfStockControlPreference>");
  if (call !== "GetItem") throw new Error("Unexpected provider mutation in intake tests");
  providerReads++;
  return new Response('<Ack>Success</Ack><Item><ItemID>123456789</ItemID><ListingType>FixedPriceItem</ListingType><ListingDuration>GTC</ListingDuration><Quantity>1</Quantity><SellingStatus><ListingStatus>Active</ListingStatus><QuantitySold>0</QuantitySold></SellingStatus><Variations><Variation><SKU>black</SKU><StartPrice currencyID="USD">20</StartPrice><Quantity>1</Quantity><SellingStatus><QuantitySold>0</QuantitySold></SellingStatus><VariationSpecifics><NameValueList><Name>Color</Name><Value>Black</Value></NameValueList></VariationSpecifics></Variation></Variations></Item>');
};

let variationKey: string;
let photo: Uint8Array;
function request(id: string, reference: string, itemId = "123456789") {
  const form = new FormData();
  form.set("requestId", id); form.set("itemId", itemId); form.set("variationKey", variationKey);
  form.set("internalReference", reference); form.set("conditionDescription", "");
  form.append("photos", new File([new Uint8Array(photo)], "copy.jpg", { type: "image/jpeg" }));
  return new Request("http://localhost/api/tasks/task-intake/copies", { method: "POST", body: form });
}
function storedPhotos() {
  return readdirSync(path.join(directory, "images"), { recursive: true }).filter((name) => String(name).endsWith(".jpg"));
}

test("copy intake validates target, cleans rolled-back images and replays concurrent submissions once", async () => {
  const listing = await fetchListing("123456789");
  variationKey = listing.variations[0].key;
  photo = await sharp({ create: { width: 600, height: 600, channels: 3, background: "white" } }).jpeg().toBuffer();
  createTask({ taskId: "task-intake", copyId: "initial", snapshot: listing, variationKey, internalReference: "INITIAL", conditionDescription: "", images: [] });
  const context = { params: Promise.resolve({ taskId: "task-intake" }) };
  const readsBefore = providerReads;
  assert.equal((await append(request("bad-id", "INVALID"), context)).status, 400);
  assert.equal((await append(request(randomUUID(), "WRONG", "999999999"), context)).status, 409);
  assert.equal(providerReads, readsBefore);
  assert.equal(getTask("task-intake")!.queuedCopies.length, 1);

  const duplicate = await create(request(randomUUID(), "DUPLICATE"));
  assert.equal(duplicate.status, 409);
  assert.equal(storedPhotos().length, 0);

  const id = randomUUID();
  const responses = await Promise.all([append(request(id, "NEXT"), context), append(request(id, "NEXT"), context)]);
  assert.deepEqual(responses.map((response) => response.status), [201, 201]);
  assert.equal(getTask("task-intake")!.queuedCopies.length, 2);
  assert.equal(storedPhotos().length, 1);
  assert.equal((await append(request(id, "CHANGED"), context)).status, 409);
  assert.equal(getTask("task-intake")!.queuedCopies.length, 2);
});


test("bulk intake replays one committed batch and keeps its per-copy settings", async () => {
  const id = randomUUID();
  const make = () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ requestId: id, itemId: "123456789", variationKey, internalReference: "BULK", count: "3", startIndex: "1", prices: '["21.00",null,"23.00"]', releaseDelaySeconds: "3600", needsApproval: "true", grade: "great" })) form.set(key, value);
    return new Request("http://localhost/api/tasks/task-intake/copies", { method: "POST", body: form });
  };
  const before = getTask("task-intake")!.queuedCopies.length;
  const context = { params: Promise.resolve({ taskId: "task-intake" }) };
  const results = await Promise.all([append(make(), context), append(make(), context)]);
  assert.deepEqual(results.map((response) => response.status), [201, 201]);
  const copies = getTask("task-intake")!.queuedCopies;
  assert.equal(copies.length, before + 3);
  assert.deepEqual(copies.slice(-3).map((copy) => [copy.internalReference, copy.targetPrice, copy.releaseDelaySeconds, copy.needsApproval, copy.grade]), [
    ["BULK-1", 21, 3600, true, "great"], ["BULK-2", null, 3600, true, "great"], ["BULK-3", 23, 3600, true, "great"],
  ]);
});
