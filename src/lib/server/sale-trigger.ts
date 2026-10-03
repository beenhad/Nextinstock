export type SaleTriggerState = "waiting" | "available" | "at_zero";

export function saleTriggerState(armedSold: number, sold: number, available: number): SaleTriggerState {
  if (sold < armedSold) return "waiting";
  if (available > 0) return "available";
  return "at_zero";
}
