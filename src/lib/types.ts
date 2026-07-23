export type EbayWriteMode = "dry-run" | "live";
export type TaskStatus =
  | "active"
  | "paused"
  | "processing"
  | "dry_run_ready"
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
  outOfStockControl: boolean | null;
  supported: boolean;
  unsupportedReasons: string[];
  fetchedAt: string;
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
  internalReference: string;
  conditionId: string | null;
  conditionName: string | null;
  conditionDescription: string;
  status: "queued" | "applying" | "live" | "archived" | "failed";
  photos: TaskPhoto[];
  createdAt: string;
}

export interface RestockTask {
  id: string;
  itemId: string;
  status: TaskStatus;
  listing: ListingSnapshot;
  queuedCopy: QueuedCopy | null;
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
  ebayCredentialSource: "nextinstock" | "sellermaid" | "missing";
  writeMode: EbayWriteMode;
  storageDriver: "local";
  storagePath: string;
  persistentStorage: boolean;
  pollSeconds: number;
  defaultItemId: string;
  liveWritesAuthorized: boolean;
  liveWritesBlocker: string | null;
}

export interface RestockPlan {
  taskId: string;
  itemId: string;
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
  } | null;
  mutation: {
    uploadLocalPhotosToEps: boolean;
    replaceAllPictureUrls: boolean;
    reviseConditionDescription: boolean;
    restoreAvailableQuantityTo: 1;
  };
  blockers: string[];
}

export interface WorkerResult {
  taskId: string;
  action:
    | "observed"
    | "waiting_for_sale"
    | "held_at_zero"
    | "dry_run_ready"
    | "restocked"
    | "skipped"
    | "failed";
  message: string;
  listing: ListingSnapshot;
  plan?: RestockPlan;
}
