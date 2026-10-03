export function parseTargetPrice(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error("Enter a restock price with at most two decimal places");
  }
  const price = Number(raw);
  if (!Number.isFinite(price) || price < 0.01 || price > 999999.99) {
    throw new Error("Restock price must be between 0.01 and 999,999.99");
  }
  return price;
}

export function assertTargetPrice(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0.01 || value > 999999.99 || Math.abs(Math.round(value * 100) - value * 100) > 0.000001) {
    throw new Error("Invalid restock price");
  }
  return value;
}
