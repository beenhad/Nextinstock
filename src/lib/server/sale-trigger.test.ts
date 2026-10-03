import assert from "node:assert/strict";
import test from "node:test";
import { saleTriggerState } from "./sale-trigger";

test("manual 1 to 0 without a sale keeps an armed task waiting", () => {
  assert.equal(saleTriggerState(8, 7, 1), "waiting");
  assert.equal(saleTriggerState(8, 7, 0), "waiting");
});

test("sold count increase at zero activates the handoff", () => {
  assert.equal(saleTriggerState(8, 8, 0), "at_zero");
  assert.equal(saleTriggerState(8, 8, 1), "available");
});

test("task created while already at zero can run without another sale", () => {
  assert.equal(saleTriggerState(7, 7, 0), "at_zero");
});
