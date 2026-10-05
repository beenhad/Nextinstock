import type { PriceRule } from "@/lib/types";

/**
 * Price for the copy `steps` sales after `base`, following the rule.
 * Amount rules add a fixed number per sale; percent rules compound per sale.
 * A cap stops increases (or a floor of 0.01 stops decreases).
 */
export function priceAfterSteps(base: number, rule: PriceRule, steps: number): number {
  const raw = rule.mode === "amount"
    ? base + rule.step * steps
    : base * Math.pow(1 + rule.step / 100, steps);
  const capped = rule.cap !== null && rule.step >= 0 ? Math.min(raw, rule.cap) : raw;
  return Math.max(0.01, Math.round(capped * 100) / 100);
}

/** Prices for `count` queued copies that follow a live price of `base`. */
export function ladderPrices(base: number, rule: PriceRule, count: number): number[] {
  return Array.from({ length: count }, (_, index) => priceAfterSteps(base, rule, index + 1));
}

export function describeRule(rule: PriceRule | null): string {
  if (!rule || rule.step === 0) return "Same price every sale";
  const sign = rule.step > 0 ? "+" : "−";
  const amount = rule.mode === "amount" ? `$${Math.abs(rule.step).toFixed(2)}` : `${Math.abs(rule.step)}%`;
  return `${sign}${amount} per sale${rule.cap !== null && rule.step > 0 ? `, up to $${rule.cap.toFixed(2)}` : ""}`;
}
