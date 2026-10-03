import assert from "node:assert/strict";
import test from "node:test";
import { parseTargetPrice } from "./price";

test("accepts a planned price or an explicit keep-live-price choice", () => {
  assert.equal(parseTargetPrice("49.99"), 49.99);
  assert.equal(parseTargetPrice(""), null);
  assert.equal(parseTargetPrice(null), null);
  assert.throws(() => parseTargetPrice("0"), /price/i);
  assert.throws(() => parseTargetPrice("12.345"), /price/i);
  assert.throws(() => parseTargetPrice("1e3"), /price/i);
});
