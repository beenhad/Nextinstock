import assert from "node:assert/strict";
import test from "node:test";
import type { ListingSnapshot, RestockTask } from "@/lib/types";
import { appliedCopyMatches, buildRestockPlan, restockWindowDue, stageAndPublishCopy } from "./restock-worker";

const listing = {
  quantityAvailable: 1,
  price: 29.99,
  imageUrls: ["https://i.ebayimg.com/a.jpg", "https://i.ebayimg.com/b.jpg"],
  conditionDescription: "Case and disc shown in photos.",
  conditionId: "3000",
} as ListingSnapshot;
const pictures = [...listing.imageUrls];
const note = listing.conditionDescription!;

test("scheduled handoff waits through its persisted eligibility time", () => {
  const run = { status: "scheduled", executeAfter: "2026-10-02T19:31:00.000Z" } as Parameters<typeof restockWindowDue>[0];
  assert.equal(restockWindowDue(run, new Date("2026-10-02T19:30:59.999Z")), false);
  assert.equal(restockWindowDue(run, new Date("2026-10-02T19:31:00.000Z")), true);
  assert.equal(restockWindowDue({ ...run, executeAfter: null }), false);
});

test("confirms quantity, complete ordered photos, and condition together", () => {
  assert.equal(appliedCopyMatches(listing, pictures, note, "3000"), true);
  assert.equal(appliedCopyMatches({ ...listing, quantityAvailable: 0 }, pictures, note, "3000", 0), true);
  assert.equal(appliedCopyMatches({ ...listing, quantityAvailable: 0 }, pictures, note, "3000"), false);
  assert.equal(appliedCopyMatches({ ...listing, quantityAvailable: 2 }, pictures, note, "3000"), false);
  assert.equal(appliedCopyMatches(listing, [...pictures].reverse(), note, "3000"), false);
  assert.equal(appliedCopyMatches(listing, [pictures[0]], note, "3000"), false);
  assert.equal(appliedCopyMatches(listing, pictures, "Different physical copy", "3000"), false);
  assert.equal(appliedCopyMatches(listing, pictures, note, "4000"), false);
  assert.equal(appliedCopyMatches(listing, pictures, note, "3000", 1, 29.99), true);
  assert.equal(appliedCopyMatches(listing, pictures, note, "3000", 1, 34.99), false);
});

test("publishes one unit only after reading a matching copy at zero", async () => {
  const calls: string[] = [];
  const snapshots = [{ ...listing, quantityAvailable: 0 }, listing];
  const confirmed = await stageAndPublishCopy(
    { itemId: "123456789", conditionId: "3000", conditionDescription: note, pictureUrls: pictures, targetPrice: 29.99, currency: "USD" },
    {
      reviseListing: async (input) => { calls.push(`stage:${input.availableQuantity}:${input.targetPrice}`); },
      readListing: async () => {
        const result = snapshots.shift();
        assert.ok(result);
        calls.push(`read:${result.quantityAvailable}`);
        return result;
      },
      publishQuantity: async (_itemId, quantity) => { calls.push(`publish:${quantity}`); },
      onStaged: () => { calls.push("verified-at-zero"); },
    },
  );
  assert.equal(confirmed.quantityAvailable, 1);
  assert.deepEqual(calls, ["stage:0:29.99", "read:0", "verified-at-zero", "publish:1", "read:1"]);
});

test("keeps quantity at zero when the staged copy does not match", async () => {
  let published = false;
  await assert.rejects(
    stageAndPublishCopy(
      { itemId: "123456789", conditionId: "3000", conditionDescription: note, pictureUrls: pictures, targetPrice: 34.99, currency: "USD" },
      {
        reviseListing: async () => {},
        readListing: async () => ({ ...listing, quantityAvailable: 0 }),
        publishQuantity: async () => { published = true; },
        onStaged: () => {},
      },
    ),
    /held at zero/,
  );
  assert.equal(published, false);
});

test("variation plan reads the selected option and leaves buyer-facing photos and condition alone", () => {
  const variation = { key: "orange", sku: null, specifics: [{ name: "Colors", value: "Spice Orange" }], label: "Colors: Spice Orange", price: 59.99, currency: "USD", quantityTotal: 70, quantitySold: 70, quantityAvailable: 0, imageUrls: ["https://i.ebayimg.com/orange.jpg"], hasSpecificPhotos: true };
  const snapshot = { ...listing, variations: [variation], unsupportedReasons: [], quantitySold: 683, quantityAvailable: 152 } as ListingSnapshot;
  const task: RestockTask = {
    id: "orange-task", itemId: "900000000201", variationKey: "orange", status: "active",
    armedQuantitySold: 70, lastSeenQuantitySold: 70, lastSeenQuantityAvailable: 0,
    lastCheckedAt: null, lastError: null, createdAt: "2026-10-02", updatedAt: "2026-10-02",
    listing: snapshot,
    queuedCopies: [],
    queuedCopy: {
      id: "copy", taskId: "orange-task", queuePosition: 1, internalReference: "ORANGE", targetPrice: 64.99, conditionId: "3000",
      conditionName: "Very Good", conditionDescription: "", status: "queued", photos: [], createdAt: "2026-10-02",
    },
  };
  const plan = buildRestockPlan(task);
  assert.equal(plan.trigger.currentQuantitySold, 70);
  assert.equal(plan.trigger.currentQuantityAvailable, 0);
  assert.equal(plan.mutation.uploadLocalPhotosToEps, false);
  assert.equal(plan.mutation.replaceAllPictureUrls, false);
  assert.equal(plan.mutation.reviseConditionDescription, false);
  assert.equal(plan.copy?.photoCount, 0);
  assert.equal(plan.copy?.targetPrice, 64.99);
  assert.equal(plan.mutation.revisePrice, true);
  assert.equal(plan.blockers.some((blocker) => /photo|condition note|policy/i.test(blocker)), false);
});
