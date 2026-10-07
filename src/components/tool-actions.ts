import type { CopyGrade, PriceRule } from "@/lib/types";

/** Edits to one queued copy. */
export type QueueAction =
  | { action: "price"; targetPrice: string }
  | { action: "move"; direction: "up" | "down" }
  | {
    action: "details";
    internalReference?: string;
    conditionDescription?: string;
    releaseDelaySeconds?: number | null;
    needsApproval?: boolean;
    grade?: CopyGrade | null;
  }
  | { action: "remove" };

/** Edits to a whole listing. */
export type TaskPatch = {
  restockDelaySeconds?: number | null;
  priceRule?: PriceRule | null;
  order?: string[];
  /** Client only: dnd-kit already animated the drop. */
  fromDrag?: boolean;
  prices?: Array<{ copyId: string; targetPrice: string | null }>;
};

/** Add copies that reuse the live listing photos. */
export type IdenticalCopies = {
  count: number;
  reference: string;
  prices: Array<number | null>;
  releaseDelaySeconds?: number | null;
  needsApproval?: boolean;
  /** Put the new copies right after this one instead of at the end. */
  afterCopyId?: string;
};

/** Add one copy with its own photos. */
export type DistinctCopy = {
  reference: string;
  files: File[];
  grade: CopyGrade | null;
  price: string;
  note: string;
  releaseDelaySeconds?: number | null;
  needsApproval?: boolean;
};

export const GRADES: Array<{ value: CopyGrade; label: string; color: string }> = [
  { value: "fair", label: "Fair", color: "#e53238" },
  { value: "good", label: "Good", color: "#f5af02" },
  { value: "great", label: "Like new", color: "#86b817" },
  { value: "new", label: "New", color: "#3665f3" },
];

export const WAIT_OPTIONS: Array<{ seconds: number; short: string; label: string }> = [
  { seconds: 900, short: "15 min", label: "15 minutes" },
  { seconds: 3600, short: "1 hr", label: "1 hour" },
  { seconds: 6 * 3600, short: "6 hr", label: "6 hours" },
  { seconds: 86400, short: "1 day", label: "1 day" },
  { seconds: 2 * 86400, short: "2 days", label: "2 days" },
  { seconds: 3 * 86400, short: "3 days", label: "3 days" },
  { seconds: 7 * 86400, short: "1 week", label: "1 week" },
];

export function waitLabel(seconds: number | null): string {
  if (seconds === null) return "";
  const match = WAIT_OPTIONS.find((option) => option.seconds === seconds);
  if (match) return match.short;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hr`;
  return `${Math.round(seconds / 86400)} days`;
}
