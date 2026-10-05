import assert from "node:assert/strict";
import test from "node:test";
import { describeRule, ladderPrices, priceAfterSteps } from "./price-rule";

test("amount rules step each sale and stop at the cap", () => {
  assert.deepEqual(ladderPrices(50, { mode: "amount", step: 2.5, cap: 56 }, 4), [52.5, 55, 56, 56]);
});

test("percent rules compound and round to cents", () => {
  assert.deepEqual(ladderPrices(100, { mode: "percent", step: 5, cap: null }, 3), [105, 110.25, 115.76]);
});

test("negative steps never go below one cent", () => {
  assert.equal(priceAfterSteps(3, { mode: "amount", step: -2, cap: null }, 5), 0.01);
});

test("rules describe themselves in plain words", () => {
  assert.equal(describeRule(null), "Same price every sale");
  assert.equal(describeRule({ mode: "amount", step: 2, cap: 99 }), "+$2.00 per sale, up to $99.00");
  assert.equal(describeRule({ mode: "percent", step: -3, cap: null }), "−3% per sale");
});
