import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { imageDirectory } from "./config";

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_PHOTOS_PER_COPY = 24;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export interface StoredImage {
  storageKey: string;
  originalName: string;
  mimeType: "image/jpeg";
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
}

export interface ImageStorageDriver {
  readonly name: "local";
  storeTaskImages(taskId: string, copyId: string, files: File[]): Promise<StoredImage[]>;
  readImage(storageKey: string): Buffer;
}

function safeSegment(value: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error("Invalid storage identifier");
  return value;
}

function absoluteStoragePath(storageKey: string): string {
  const root = path.resolve(imageDirectory());
  const absolute = path.resolve(root, storageKey);
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error("Invalid storage path");
  return absolute;
}

async function storeLocalTaskImages(
  taskId: string,
  copyId: string,
  files: File[],
): Promise<StoredImage[]> {
  if (files.length === 0) throw new Error("Add at least one photo");
  if (files.length > MAX_PHOTOS_PER_COPY) {
    throw new Error(`A copy can contain at most ${MAX_PHOTOS_PER_COPY} photos`);
  }

  const relativeDirectory = path.join(safeSegment(taskId), safeSegment(copyId));
  mkdirSync(path.dirname(absoluteStoragePath(path.join(relativeDirectory, "placeholder"))), {
    recursive: true,
    mode: 0o700,
  });
  const stored: StoredImage[] = [];

  try {
    for (const file of files) {
      if (!ALLOWED_TYPES.has(file.type)) {
        throw new Error(`${file.name} is not a supported image type`);
      }
      if (file.size <= 0 || file.size > MAX_SOURCE_BYTES) {
        throw new Error(`${file.name} must be between 1 byte and 20 MB`);
      }

      const source = Buffer.from(await file.arrayBuffer());
      const pipeline = sharp(source, { failOn: "error" }).rotate();
      const metadata = await pipeline.metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error(`${file.name} does not contain a readable image`);
      }
      if (Math.max(metadata.width, metadata.height) < 500) {
        throw new Error(`${file.name} must be at least 500 pixels on its longest side`);
      }

      const normalized = await pipeline
        .resize({ width: 3000, height: 3000, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
        .toBuffer({ resolveWithObject: true });

      const filename = `${randomUUID()}.jpg`;
      const storageKey = path.join(relativeDirectory, filename);
      writeFileSync(absoluteStoragePath(storageKey), normalized.data, { mode: 0o600 });
      stored.push({
        storageKey,
        originalName: file.name.slice(0, 255),
        mimeType: "image/jpeg",
        byteSize: normalized.data.byteLength,
        width: normalized.info.width,
        height: normalized.info.height,
        sha256: createHash("sha256").update(normalized.data).digest("hex"),
      });
    }
    return stored;
  } catch (error) {
    for (const image of stored) {
      try {
        unlinkSync(absoluteStoragePath(image.storageKey));
      } catch {
        // Best-effort rollback. The unreferenced file can be cleaned later.
      }
    }
    throw error;
  }
}

const localStorageDriver: ImageStorageDriver = {
  name: "local",
  storeTaskImages: storeLocalTaskImages,
  readImage(storageKey) {
    return readFileSync(absoluteStoragePath(storageKey));
  },
};

export function imageStorageDriver(): ImageStorageDriver {
  const configured = process.env.NEXTINSTOCK_STORAGE_DRIVER?.trim() || "local";
  if (configured !== "local") {
    throw new Error(`Storage driver "${configured}" is not installed; use local for the MVP`);
  }
  return localStorageDriver;
}

export function storeTaskImages(
  taskId: string,
  copyId: string,
  files: File[],
): Promise<StoredImage[]> {
  return imageStorageDriver().storeTaskImages(taskId, copyId, files);
}

export function readStoredImage(storageKey: string): Buffer {
  return imageStorageDriver().readImage(storageKey);
}
