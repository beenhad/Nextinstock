export type HandoffStatus = "created" | "awaiting_approval" | "blocked" | "dry_run" | "scheduled" | "uploading" | "revising" | "publishing" | "reconciling" | "failed" | "completed";

const transitions: Record<HandoffStatus, readonly HandoffStatus[]> = {
  created: ["awaiting_approval", "blocked", "dry_run", "scheduled"],
  blocked: ["awaiting_approval", "blocked", "dry_run", "scheduled"],
  dry_run: ["awaiting_approval", "blocked", "dry_run", "scheduled"],
  scheduled: ["blocked", "dry_run", "uploading", "publishing", "failed", "reconciling"],
  uploading: ["revising", "failed"],
  revising: ["publishing", "failed"],
  publishing: ["completed", "reconciling"],
  reconciling: ["reconciling", "completed", "scheduled"],
  failed: ["awaiting_approval", "blocked", "dry_run", "scheduled"],
  awaiting_approval: ["created", "reconciling"],
  completed: ["completed"],
};

export function assertHandoffTransition(from: string, to: HandoffStatus) {
  if (!Object.hasOwn(transitions, from) || !transitions[from as HandoffStatus].includes(to)) {
    throw new Error(`Invalid handoff transition: ${from} → ${to}`);
  }
}

export function publicationUncertain(status: string): boolean {
  return status === "publishing" || status === "reconciling";
}
