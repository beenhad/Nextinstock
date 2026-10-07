export type EbayWriteMode = "dry-run" | "live";
export type TaskStatus =
  | "active"
  | "paused"
  | "processing"
  | "scheduled"
  | "dry_run_ready"
  | "awaiting_approval"
  | "attention"
  | "error";

export interface ListingSnapshot {
  itemId: string;
  sku: string | null;
  title: string;
  listingUrl: string;
  listingType: string;
  listingStatus: string;
  listingDuration: string | null;
  conditionId: string | null;
  conditionName: string | null;
  conditionDescription: string | null;
  price: number | null;
  currency: string;
  quantityTotal: number;
  quantitySold: number;
  quantityAvailable: number;
  imageUrls: string[];
  variationCount: number;
  variations: ListingVariation[];
  variationPictureAxis: string | null;
  outOfStockControl: boolean | null;
  supported: boolean;
  unsupportedReasons: string[];
  fetchedAt: string;
}

export interface ListingVariation {
  key: string;
  sku: string | null;
  specifics: Array<{ name: string; value: string }>;
  label: string;
  price: number | null;
  currency: string;
  quantityTotal: number;
  quantitySold: number;
  quantityAvailable: number;
  imageUrls: string[];
  hasSpecificPhotos: boolean;
}

export interface TaskPhoto {
  id: string;
  copyId: string;
  position: number;
  originalName: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
  url: string;
  ebayImageId: string | null;
  ebayImageUrl: string | null;
}

export interface QueuedCopy {
  id: string;
  taskId: string;
  queuePosition: number;
  internalReference: string;
  targetPrice: number | null;
  conditionId: string | null;
  conditionName: string | null;
  conditionDescription: string;
  /** Seconds to wait after the previous copy sells; null uses the listing/app default. */
  releaseDelaySeconds: number | null;
  /** Hold this copy until the seller approves it in Next or from the Discord alert. */
  needsApproval: boolean;
  /** Seller's own condition grade, used to color and sort the release line. */
  grade: CopyGrade | null;
  status: "queued" | "applying" | "live" | "archived" | "failed";
  photos: TaskPhoto[];
  createdAt: string;
}

export type CopyGrade = "fair" | "good" | "great" | "new";

/** How each queued copy's price moves away from the one before it. */
export interface PriceRule {
  mode: "amount" | "percent";
  step: number;
  cap: number | null;
}

export interface RestockTask {
  id: string;
  itemId: string;
  variationKey: string | null;
  status: TaskStatus;
  /** Seconds to wait after a sale before restocking; null uses the app default. */
  restockDelaySeconds: number | null;
  priceRule: PriceRule | null;
  listing: ListingSnapshot;
  queuedCopy: QueuedCopy | null;
  queuedCopies: QueuedCopy[];
  armedQuantitySold: number;
  lastSeenQuantitySold: number;
  lastSeenQuantityAvailable: number;
  lastCheckedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEvent {
  id: number;
  taskId: string | null;
  type: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface SystemStatus {
  ebayConfigured: boolean;
  ebayCredentialSource: "nextinstock" | "environment" | "missing";
  writeMode: EbayWriteMode;
  storageDriver: "local";
  storagePath: string;
  persistentStorage: boolean;
  pollSeconds: number;
  restockDelaySeconds: number;
  defaultItemId: string;
  liveWritesAuthorized: boolean;
  liveWritesBlocker: string | null;
  discordConnected: boolean;
}

export interface EbayProfile {
  userId: string;
  avatarUrl: string | null;
  profileUrl: string;
}

export interface RestockPlan {
  taskId: string;
  itemId: string;
  variationKey: string | null;
  writeMode: EbayWriteMode;
  trigger: {
    armedQuantitySold: number;
    currentQuantitySold: number;
    currentQuantityAvailable: number;
  };
  copy: {
    id: string;
    internalReference: string;
    conditionId: string | null;
    conditionDescription: string;
    photoCount: number;
    targetPrice: number | null;
  } | null;
  mutation: {
    uploadLocalPhotosToEps: boolean;
    replaceAllPictureUrls: boolean;
    reviseConditionDescription: boolean;
    revisePrice: boolean;
    verifyWhileAtZero: boolean;
    restoreAvailableQuantityTo: 1;
  };
  blockers: string[];
}

export interface WorkerResult {
  taskId: string;
  action:
    | "observed"
    | "waiting_for_sale"
    | "restock_scheduled"
    | "waiting_for_restock"
    | "restocking"
    | "held_at_zero"
    | "awaiting_approval"
    | "dry_run_ready"
    | "restocked"
    | "skipped"
    | "failed";
  message: string;
  listing: ListingSnapshot;
  plan?: RestockPlan;
  scheduledFor?: string;
  remainingQueuedCopies?: number;
  trigger?: {
    kind: "new_sale" | "already_at_zero";
    previousSold: number;
    previousAvailable: number;
  };
}
