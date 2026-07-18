import { env } from "cloudflare:workers";
import { createRandomToken, sha256Base64Url } from "./auth";
import { MEDIA_DERIVATIVE_POLICY_VERSION, mediaDeliveryUrl } from "./media-policy";

export const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
export const MEDIA_INTENT_TTL_SECONDS = 10 * 60;
export const MEDIA_MODERATION_EVENT_TABLE = "media_moderation_events";

export type MediaPurpose = "recipe_hero" | "recipe_step" | "avatar";
export type MediaModerationStatus = "pending" | "approved" | "rejected" | "quarantined";

export type MediaBindings = {
  DB?: D1Database;
  MEDIA?: R2Bucket;
  IMAGES?: ImagesBinding;
};

type UploadIntentRow = {
  id: string;
  owner_id: string;
  r2_key: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  purpose: MediaPurpose;
  alt_text: string | null;
  expires_at: string;
};

export type MediaAssetRow = {
  id: string;
  owner_id: string | null;
  r2_key: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  byte_size: number;
  alt_text: string | null;
  upload_status: string;
  moderation_status: MediaModerationStatus;
  sha256: string | null;
  storage_etag: string | null;
  source_orientation: number;
  normalized_width: number | null;
  normalized_height: number | null;
  derivative_status?: string | null;
  created_at: string;
};

export type ValidatedImage = {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
  width: number;
  height: number;
  sourceOrientation: number;
  normalizedWidth: number;
  normalizedHeight: number;
  byteSize: number;
  sha256: string;
};

const bindings = env as unknown as MediaBindings;
const allowedMimeTypes = new Map<ValidatedImage["mimeType"], ValidatedImage["extension"]>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function getDatabase(): D1Database | undefined {
  return bindings.DB;
}

function getBucket(): R2Bucket | undefined {
  return bindings.MEDIA;
}

function getImages(): ImagesBinding | undefined {
  return bindings.IMAGES;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function sha256Buffer(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return bytesToBase64Url(new Uint8Array(digest));
}

export function getMediaReadiness() {
  const database = Boolean(getDatabase());
  const storage = Boolean(getBucket());
  const transformations = Boolean(getImages());
  return {
    ready: database && storage && transformations,
    database,
    storage,
    transformations,
    maxBytes: MAX_MEDIA_BYTES,
    allowedMimeTypes: [...allowedMimeTypes.keys()],
    derivativePolicyVersion: MEDIA_DERIVATIVE_POLICY_VERSION,
  };
}

function cleanFilename(value: unknown): string {
  if (typeof value !== "string") return "";
  const base = value.split(/[\\/]/).pop() ?? "";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function cleanAltText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 240) : "";
}

function normalisePurpose(value: unknown): MediaPurpose {
  return value === "recipe_step" || value === "avatar" ? value : "recipe_hero";
}

export function validateMediaIntentInput(input: {
  filename: unknown;
  mimeType: unknown;
  byteSize: unknown;
  purpose?: unknown;
  altText?: unknown;
}) {
  const filename = cleanFilename(input.filename);
  const mimeTypeText = typeof input.mimeType === "string" ? input.mimeType.trim().toLowerCase() : "";
  const mimeType = mimeTypeText as ValidatedImage["mimeType"];
  const byteSize = Number(input.byteSize);
  const purpose = normalisePurpose(input.purpose);
  const altText = cleanAltText(input.altText);
  const errors: string[] = [];

  if (!filename) errors.push("Choose an image file with a valid filename.");
  if (!allowedMimeTypes.has(mimeType)) errors.push("Only JPEG, PNG, and WebP images are accepted.");
  if (!Number.isInteger(byteSize) || byteSize < 1 || byteSize > MAX_MEDIA_BYTES) {
    errors.push(`Image size must be between 1 byte and ${MAX_MEDIA_BYTES} bytes.`);
  }
  if (purpose !== "avatar" && altText.length < 5) errors.push("Add descriptive alternative text with at least 5 characters.");

  return {
    valid: errors.length === 0,
    errors,
    filename,
    mimeType,
    byteSize,
    purpose,
    altText: altText || null,
  };
}

function createR2Key(userId: string, extension: string): string {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  if (!safeUserId) throw new Error("Media owner identifier is invalid.");
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `uploads/${safeUserId}/${year}/${month}/${crypto.randomUUID()}.${extension}`;
}

export async function createMediaUploadIntent(userId: string, input: {
  filename: unknown;
  mimeType: unknown;
  byteSize: unknown;
  purpose?: unknown;
  altText?: unknown;
}) {
  if (!getMediaReadiness().ready) throw new Error("Media storage and transformations are not configured.");

  const validated = validateMediaIntentInput(input);
  if (!validated.valid) return { ok: false as const, errors: validated.errors };

  const database = getDatabase()!;
  const token = createRandomToken(32);
  const tokenHash = await sha256Base64Url(token);
  const extension = allowedMimeTypes.get(validated.mimeType)!;
  const r2Key = createR2Key(userId, extension);
  const intentId = `intent_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + MEDIA_INTENT_TTL_SECONDS * 1000).toISOString();

  await database.prepare(
    `INSERT INTO media_upload_intents (
      id, owner_id, token_hash, r2_key, original_filename, mime_type,
      byte_size, purpose, alt_text, status, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).bind(
    intentId,
    userId,
    tokenHash,
    r2Key,
    validated.filename,
    validated.mimeType,
    validated.byteSize,
    validated.purpose,
    validated.altText,
    expiresAt,
  ).run();

  return {
    ok: true as const,
    token,
    uploadUrl: "/api/media/upload",
    expiresAt,
    expected: { mimeType: validated.mimeType, byteSize: validated.byteSize },
  };
}

export async function findPendingUploadIntent(token: string, userId: string): Promise<UploadIntentRow | null> {
  const database = getDatabase();
  if (!database || token.length < 32 || token.length > 256) return null;
  const tokenHash = await sha256Base64Url(token);
  return database.prepare(
    `SELECT id, owner_id, r2_key, original_filename, mime_type, byte_size, purpose, alt_text, expires_at
     FROM media_upload_intents
     WHERE token_hash = ?
       AND owner_id = ?
       AND status = 'pending'
       AND expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
  ).bind(tokenHash, userId).first<UploadIntentRow>();
}

export async function claimUploadIntent(intentId: string): Promise<boolean> {
  const database = getDatabase();
  if (!database) return false;
  const result = await database.prepare(
    `UPDATE media_upload_intents
     SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP`,
  ).bind(intentId).run();
  return Boolean(result.success && (result.meta.changes ?? 0) === 1);
}

export async function markUploadIntentFailed(intentId: string): Promise<void> {
  const database = getDatabase();
  if (database) {
    await database.prepare(
      `UPDATE media_upload_intents
       SET status = 'failed', completed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN ('pending', 'consumed')`,
    ).bind(intentId).run();
  }
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.length) return "";
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function parseTiffOrientation(bytes: Uint8Array, tiffOffset: number): number {
  if (tiffOffset < 0 || tiffOffset + 8 > bytes.length) return 1;
  const byteOrder = readAscii(bytes, tiffOffset, 2);
  const littleEndian = byteOrder === "II";
  if (!littleEndian && byteOrder !== "MM") return 1;

  const read16 = (offset: number) => littleEndian
    ? bytes[offset] | (bytes[offset + 1] << 8)
    : (bytes[offset] << 8) | bytes[offset + 1];
  const read32 = (offset: number) => littleEndian ? readUint32LE(bytes, offset) : readUint32BE(bytes, offset);
  if (read16(tiffOffset + 2) !== 42) return 1;

  const firstIfd = read32(tiffOffset + 4);
  const ifdOffset = tiffOffset + firstIfd;
  if (firstIfd > bytes.length || ifdOffset < tiffOffset || ifdOffset + 2 > bytes.length) return 1;
  const entryCount = Math.min(read16(ifdOffset), 256);
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = ifdOffset + 2 + index * 12;
    if (entryOffset + 12 > bytes.length) break;
    if (read16(entryOffset) !== 0x0112) continue;
    const type = read16(entryOffset + 2);
    const count = read32(entryOffset + 4);
    if (type !== 3 || count < 1) return 1;
    const orientation = read16(entryOffset + 8);
    return orientation >= 1 && orientation <= 8 ? orientation : 1;
  }
  return 1;
}

function parseJpegOrientation(bytes: Uint8Array): number {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) break;
    const dataOffset = offset + 2;
    if (marker === 0xe1 && readAscii(bytes, dataOffset, 6) === "Exif\u0000\u0000") {
      return parseTiffOrientation(bytes, dataOffset + 6);
    }
    offset += length;
  }
  return 1;
}

function parsePngOrientation(bytes: Uint8Array): number {
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const type = readAscii(bytes, offset + 4, 4);
    const dataOffset = offset + 8;
    if (dataOffset + length + 4 > bytes.length) break;
    if (type === "eXIf") return parseTiffOrientation(bytes, dataOffset);
    if (type === "IEND") break;
    offset = dataOffset + length + 4;
  }
  return 1;
}

function parseWebpOrientation(bytes: Uint8Array): number {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = readAscii(bytes, offset, 4);
    const length = readUint32LE(bytes, offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + length > bytes.length) break;
    if (type === "EXIF") {
      const tiffOffset = readAscii(bytes, dataOffset, 6) === "Exif\u0000\u0000" ? dataOffset + 6 : dataOffset;
      return parseTiffOrientation(bytes, tiffOffset);
    }
    offset = dataOffset + length + (length % 2);
  }
  return 1;
}

function parsePng(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) return null;
  return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
}

function parseJpeg(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;

  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) return null;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    if (sofMarkers.has(marker) && length >= 7) {
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    }
    offset += length;
  }
  return null;
}

function parseWebp(bytes: Uint8Array): { width: number; height: number } | null {
  if (
    bytes.length < 30
    || readAscii(bytes, 0, 4) !== "RIFF"
    || readAscii(bytes, 8, 4) !== "WEBP"
  ) return null;

  const chunk = readAscii(bytes, 12, 4);
  const dataOffset = 20;
  if (chunk === "VP8X") {
    return { width: 1 + readUint24LE(bytes, 24), height: 1 + readUint24LE(bytes, 27) };
  }
  if (chunk === "VP8 " && bytes.length >= dataOffset + 10) {
    if (bytes[dataOffset + 3] !== 0x9d || bytes[dataOffset + 4] !== 0x01 || bytes[dataOffset + 5] !== 0x2a) return null;
    return {
      width: (bytes[dataOffset + 6] | (bytes[dataOffset + 7] << 8)) & 0x3fff,
      height: (bytes[dataOffset + 8] | (bytes[dataOffset + 9] << 8)) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && bytes.length >= dataOffset + 5 && bytes[dataOffset] === 0x2f) {
    const b1 = bytes[dataOffset + 1];
    const b2 = bytes[dataOffset + 2];
    const b3 = bytes[dataOffset + 3];
    const b4 = bytes[dataOffset + 4];
    return {
      width: 1 + (((b2 & 0x3f) << 8) | b1),
      height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
    };
  }
  return null;
}

export function normalisedDimensions(width: number, height: number, orientation: number): { width: number; height: number } {
  return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
}

export async function validateImageBytes(buffer: ArrayBuffer, declaredMimeType: string): Promise<ValidatedImage> {
  if (buffer.byteLength < 16 || buffer.byteLength > MAX_MEDIA_BYTES) throw new Error("Image size is outside the accepted range.");
  const bytes = new Uint8Array(buffer);
  let dimensions: { width: number; height: number } | null = null;
  let mimeType: ValidatedImage["mimeType"];
  let extension: ValidatedImage["extension"];

  if ((dimensions = parsePng(bytes))) {
    mimeType = "image/png";
    extension = "png";
  } else if ((dimensions = parseJpeg(bytes))) {
    mimeType = "image/jpeg";
    extension = "jpg";
  } else if ((dimensions = parseWebp(bytes))) {
    mimeType = "image/webp";
    extension = "webp";
  } else {
    throw new Error("The uploaded file is not a valid JPEG, PNG, or WebP image.");
  }

  if (mimeType !== declaredMimeType) throw new Error("The file signature does not match its declared content type.");
  const sourceOrientation = mimeType === "image/jpeg"
    ? parseJpegOrientation(bytes)
    : mimeType === "image/png"
      ? parsePngOrientation(bytes)
      : parseWebpOrientation(bytes);
  const normalized = normalisedDimensions(dimensions.width, dimensions.height, sourceOrientation);
  if (normalized.width < 320 || normalized.height < 240) {
    throw new Error("Recipe images must be at least 320 by 240 pixels after orientation is normalized.");
  }
  if (dimensions.width > 12_000 || dimensions.height > 12_000 || dimensions.width * dimensions.height > 40_000_000) {
    throw new Error("Image dimensions exceed the accepted safety limit.");
  }

  return {
    mimeType,
    extension,
    width: dimensions.width,
    height: dimensions.height,
    sourceOrientation,
    normalizedWidth: normalized.width,
    normalizedHeight: normalized.height,
    byteSize: buffer.byteLength,
    sha256: await sha256Buffer(buffer),
  };
}

export async function storeValidatedImage(intent: UploadIntentRow, buffer: ArrayBuffer, image: ValidatedImage) {
  const database = getDatabase();
  const bucket = getBucket();
  if (!database || !bucket) throw new Error("Media storage is not configured.");

  const assetId = `media_${crypto.randomUUID()}`;
  let stored = false;
  try {
    const object = await bucket.put(intent.r2_key, buffer, {
      httpMetadata: { contentType: image.mimeType, cacheControl: "private, no-store" },
      customMetadata: {
        assetId,
        ownerId: intent.owner_id,
        moderationStatus: "pending",
        sha256: image.sha256,
        sourceOrientation: String(image.sourceOrientation),
      },
    });
    stored = true;

    const results = await database.batch([
      database.prepare(
        `INSERT INTO media_assets (
          id, owner_id, r2_key, mime_type, width, height, byte_size, alt_text,
          original_filename, purpose, upload_status, moderation_status, sha256,
          storage_etag, source_orientation, normalized_width, normalized_height,
          uploaded_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', 'pending', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      ).bind(
        assetId,
        intent.owner_id,
        intent.r2_key,
        image.mimeType,
        image.width,
        image.height,
        image.byteSize,
        intent.alt_text,
        intent.original_filename,
        intent.purpose,
        image.sha256,
        object.httpEtag,
        image.sourceOrientation,
        image.normalizedWidth,
        image.normalizedHeight,
      ),
      database.prepare(
        `INSERT INTO media_derivative_jobs (
          media_id, policy_version, source_sha256, status, created_at, updated_at
        ) VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      ).bind(assetId, MEDIA_DERIVATIVE_POLICY_VERSION, image.sha256),
      database.prepare(
        `UPDATE media_upload_intents
         SET status = 'uploaded', completed_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'consumed'`,
      ).bind(intent.id),
    ]);
    if (!results.every((result) => result.success)) throw new Error("Media metadata could not be committed.");

    return {
      id: assetId,
      key: intent.r2_key,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      normalizedWidth: image.normalizedWidth,
      normalizedHeight: image.normalizedHeight,
      sourceOrientation: image.sourceOrientation,
      byteSize: image.byteSize,
      altText: intent.alt_text,
      moderationStatus: "pending" as const,
      derivativeStatus: "pending" as const,
      previewUrl: mediaDeliveryUrl(intent.r2_key, image.sha256, true),
    };
  } catch (error) {
    if (stored) await bucket.delete(intent.r2_key);
    await markUploadIntentFailed(intent.id);
    throw error;
  }
}

export async function findMediaAssetByKey(key: string): Promise<MediaAssetRow | null> {
  const database = getDatabase();
  if (!database) return null;
  return database.prepare(
    `SELECT id, owner_id, r2_key, mime_type, width, height, byte_size, alt_text,
            upload_status, moderation_status, sha256, storage_etag, source_orientation,
            normalized_width, normalized_height, created_at
     FROM media_assets
     WHERE r2_key = ?
     LIMIT 1`,
  ).bind(key).first<MediaAssetRow>();
}

export async function listOwnedMedia(userId: string, limit = 20) {
  const database = getDatabase();
  if (!database) return [];
  const bounded = Math.min(Math.max(limit, 1), 50);
  const result = await database.prepare(
    `SELECT media_assets.id, media_assets.owner_id, media_assets.r2_key, media_assets.mime_type,
            media_assets.width, media_assets.height, media_assets.byte_size, media_assets.alt_text,
            media_assets.upload_status, media_assets.moderation_status, media_assets.sha256,
            media_assets.storage_etag, media_assets.source_orientation, media_assets.normalized_width,
            media_assets.normalized_height, media_assets.created_at,
            media_derivative_jobs.status AS derivative_status
     FROM media_assets
     LEFT JOIN media_derivative_jobs ON media_derivative_jobs.media_id = media_assets.id
     WHERE media_assets.owner_id = ? AND media_assets.upload_status != 'deleted'
     ORDER BY media_assets.created_at DESC
     LIMIT ?`,
  ).bind(userId, bounded).all<MediaAssetRow>();
  return result.results ?? [];
}
