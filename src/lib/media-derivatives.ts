import { env } from "cloudflare:workers";
import { sha256Buffer, type MediaBindings } from "./media";
import {
  MEDIA_AVIF_MAX_WIDTH,
  MEDIA_DERIVATIVE_FORMATS,
  MEDIA_DERIVATIVE_LOCK_SECONDS,
  MEDIA_DERIVATIVE_POLICY_VERSION,
  type MediaDerivativeFormat,
  mediaDerivativeWidths,
} from "./media-policy";

type SourceAssetRow = {
  id: string;
  owner_id: string | null;
  r2_key: string;
  mime_type: string;
  upload_status: string;
  moderation_status: string;
  sha256: string;
  storage_etag: string | null;
  normalized_width: number;
  normalized_height: number;
};

export type MediaDerivativeRow = {
  id: string;
  media_id: string;
  policy_version: string;
  source_sha256: string;
  variant_width: number;
  format: MediaDerivativeFormat;
  mime_type: string;
  r2_key: string;
  width: number;
  height: number;
  byte_size: number;
  sha256: string;
  storage_etag: string;
  status: string;
};

const bindings = env as unknown as MediaBindings;

function getDatabase(): D1Database | undefined {
  return bindings.DB;
}

function getBucket(): R2Bucket | undefined {
  return bindings.MEDIA;
}

function getImages(): ImagesBinding | undefined {
  return bindings.IMAGES;
}

export function getMediaDerivativeReadiness() {
  const database = Boolean(getDatabase());
  const storage = Boolean(getBucket());
  const transformations = Boolean(getImages());
  return {
    ready: database && storage && transformations,
    database,
    storage,
    transformations,
    policyVersion: MEDIA_DERIVATIVE_POLICY_VERSION,
    widths: [...mediaDerivativeWidths(1280)],
    requiredFormats: ["jpeg", "webp"],
    optionalFormats: ["avif"],
    avifMaxWidth: MEDIA_AVIF_MAX_WIDTH,
    originalPublicDelivery: false,
    approvalRequired: true,
    readyDerivativesRequired: true,
    orientationNormalization: true,
    metadataStrippingVerified: true,
    deterministicKeys: true,
    idempotentLocks: true,
    checksumRegeneration: true,
    cleanupLifecycle: true,
  };
}

function safeSegment(value: string, maximum = 100): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, maximum);
}

function derivativeKey(mediaId: string, sourceSha256: string, width: number, format: MediaDerivativeFormat): string {
  const definition = MEDIA_DERIVATIVE_FORMATS[format];
  const media = safeSegment(mediaId);
  const checksum = safeSegment(sourceSha256, 32);
  if (!media || !checksum) throw new Error("Derivative object identity is invalid.");
  return `derivatives/${media}/${MEDIA_DERIVATIVE_POLICY_VERSION}/${checksum}/w${width}.${definition.extension}`;
}

function expectedHeight(sourceWidth: number, sourceHeight: number, width: number): number {
  return Math.max(1, Math.round((sourceHeight / sourceWidth) * width));
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.length) return "";
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function assertJpegMetadataStripped(bytes: Uint8Array): void {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("JPEG derivative signature is invalid.");
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) return;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) break;
    if (marker === 0xe1 || marker === 0xe2 || marker === 0xed || marker === 0xfe) {
      throw new Error("JPEG derivative retained private or unnecessary metadata.");
    }
    offset += length;
  }
  throw new Error("JPEG derivative structure is invalid.");
}

function assertWebpMetadataStripped(bytes: Uint8Array): void {
  if (readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 4) !== "WEBP") {
    throw new Error("WebP derivative signature is invalid.");
  }
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = readAscii(bytes, offset, 4);
    const length = readUint32LE(bytes, offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + length > bytes.length) throw new Error("WebP derivative structure is invalid.");
    if (type === "EXIF" || type === "XMP " || type === "ICCP") {
      throw new Error("WebP derivative retained private or unnecessary metadata.");
    }
    offset = dataOffset + length + (length % 2);
  }
}

function containsAscii(bytes: Uint8Array, marker: string): boolean {
  const needle = Uint8Array.from(marker, (character) => character.charCodeAt(0));
  if (!needle.length || needle.length > bytes.length) return false;
  outer: for (let offset = 0; offset <= bytes.length - needle.length; offset += 1) {
    for (let index = 0; index < needle.length; index += 1) {
      if (bytes[offset + index] !== needle[index]) continue outer;
    }
    return true;
  }
  return false;
}

function assertAvifMetadataStripped(bytes: Uint8Array): void {
  for (const marker of ["Exif\u0000\u0000", "<x:xmpmeta", "application/rdf+xml"]) {
    if (containsAscii(bytes, marker)) throw new Error("AVIF derivative retained private metadata.");
  }
  if (readAscii(bytes, 4, 4) !== "ftyp") throw new Error("AVIF derivative signature is invalid.");
}

function assertMetadataStripped(format: MediaDerivativeFormat, buffer: ArrayBuffer): void {
  const bytes = new Uint8Array(buffer);
  if (format === "jpeg") assertJpegMetadataStripped(bytes);
  else if (format === "webp") assertWebpMetadataStripped(bytes);
  else assertAvifMetadataStripped(bytes);
}

async function readSourceAsset(mediaId: string): Promise<SourceAssetRow | null> {
  const database = getDatabase();
  if (!database) return null;
  return database.prepare(
    `SELECT id, owner_id, r2_key, mime_type, upload_status, moderation_status, sha256,
            storage_etag, normalized_width, normalized_height
     FROM media_assets
     WHERE id = ?
       AND upload_status = 'uploaded'
       AND sha256 IS NOT NULL
       AND normalized_width IS NOT NULL
       AND normalized_height IS NOT NULL
     LIMIT 1`,
  ).bind(mediaId).first<SourceAssetRow>();
}

async function ensureJob(asset: SourceAssetRow): Promise<void> {
  const database = getDatabase()!;
  await database.prepare(
    `INSERT INTO media_derivative_jobs (
       media_id, policy_version, source_sha256, status, created_at, updated_at
     ) VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(media_id) DO UPDATE SET
       policy_version = excluded.policy_version,
       source_sha256 = excluded.source_sha256,
       status = CASE
         WHEN media_derivative_jobs.policy_version <> excluded.policy_version
           OR media_derivative_jobs.source_sha256 <> excluded.source_sha256
         THEN 'pending'
         ELSE media_derivative_jobs.status
       END,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(asset.id, MEDIA_DERIVATIVE_POLICY_VERSION, asset.sha256).run();
}

async function claimGeneration(asset: SourceAssetRow, force: boolean): Promise<string | null> {
  const database = getDatabase()!;
  const leaseId = `lease_${crypto.randomUUID()}`;
  const result = await database.prepare(
    `UPDATE media_derivative_jobs
     SET status = 'generating', generation_token = ?,
         lock_expires_at = datetime('now', ?), attempts = attempts + 1,
         last_error_code = NULL, last_error_message = NULL,
         completed_at = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE media_id = ? AND policy_version = ? AND source_sha256 = ?
       AND (status IN ('pending', 'failed', 'cleaned')
         OR (status = 'generating' AND lock_expires_at <= CURRENT_TIMESTAMP)
         OR (? = 1 AND status = 'ready'))`,
  ).bind(
    leaseId,
    `+${MEDIA_DERIVATIVE_LOCK_SECONDS} seconds`,
    asset.id,
    MEDIA_DERIVATIVE_POLICY_VERSION,
    asset.sha256,
    force ? 1 : 0,
  ).run();
  return result.success && (result.meta.changes ?? 0) === 1 ? leaseId : null;
}

async function transformVariant(
  images: ImagesBinding,
  source: ArrayBuffer,
  asset: SourceAssetRow,
  width: number,
  format: MediaDerivativeFormat,
): Promise<{ buffer: ArrayBuffer; mimeType: string; width: number; height: number; sha256: string }> {
  const definition = MEDIA_DERIVATIVE_FORMATS[format];
  const result = await images
    .input(new Blob([source], { type: asset.mime_type }).stream())
    .transform({ width, fit: "scale-down" })
    .output({
      format: definition.mimeType,
      quality: definition.quality,
      background: format === "jpeg" ? "#ffffff" : undefined,
      anim: false,
    });
  const mimeType = result.contentType().split(";", 1)[0].trim().toLowerCase();
  if (mimeType !== definition.mimeType) {
    throw new Error(`Requested ${definition.mimeType} but the runtime returned ${mimeType || "an unknown format"}.`);
  }
  const buffer = await new Response(result.image()).arrayBuffer();
  assertMetadataStripped(format, buffer);
  const info = await images.info(new Blob([buffer], { type: mimeType }).stream());
  if (!("width" in info) || !("height" in info)) throw new Error("Derivative dimensions could not be verified.");
  const expectedWidth = Math.min(width, asset.normalized_width);
  const expectedVariantHeight = expectedHeight(asset.normalized_width, asset.normalized_height, expectedWidth);
  if (info.width !== expectedWidth || Math.abs(info.height - expectedVariantHeight) > 1) {
    throw new Error("Derivative dimensions do not match normalized source orientation.");
  }
  return { buffer, mimeType, width: info.width, height: info.height, sha256: await sha256Buffer(buffer) };
}

async function markJobFailed(mediaId: string, leaseId: string, error: unknown): Promise<void> {
  const database = getDatabase();
  if (!database) return;
  const message = error instanceof Error ? error.message : "Derivative generation failed.";
  await database.prepare(
    `UPDATE media_derivative_jobs
     SET status = 'failed', generation_token = NULL, lock_expires_at = NULL,
         last_error_code = 'generation_failed', last_error_message = ?, updated_at = CURRENT_TIMESTAMP
     WHERE media_id = ? AND generation_token = ?`,
  ).bind(message.slice(0, 500), mediaId, leaseId).run();
}

export async function generateMediaDerivatives(mediaId: string, options: { force?: boolean } = {}) {
  const database = getDatabase();
  const bucket = getBucket();
  const images = getImages();
  if (!database || !bucket || !images) throw new Error("Media derivative dependencies are not configured.");

  const asset = await readSourceAsset(mediaId);
  if (!asset) return { ok: false as const, status: "missing" as const };
  if (asset.moderation_status === "rejected" || asset.moderation_status === "quarantined") {
    return { ok: false as const, status: "blocked" as const };
  }
  await ensureJob(asset);

  const current = await database.prepare(
    `SELECT status, policy_version, source_sha256, required_variant_count, ready_variant_count,
            optional_variant_count
     FROM media_derivative_jobs WHERE media_id = ?`,
  ).bind(asset.id).first<{
    status: string;
    policy_version: string;
    source_sha256: string;
    required_variant_count: number;
    ready_variant_count: number;
    optional_variant_count: number;
  }>();
  if (!options.force && current?.status === "ready"
    && current.policy_version === MEDIA_DERIVATIVE_POLICY_VERSION
    && current.source_sha256 === asset.sha256
    && current.required_variant_count > 0
    && current.ready_variant_count >= current.required_variant_count) {
    return { ok: true as const, status: "ready" as const, generated: 0, optional: current.optional_variant_count };
  }

  const leaseId = await claimGeneration(asset, Boolean(options.force));
  if (!leaseId) return { ok: false as const, status: "busy" as const };

  try {
    const original = await bucket.get(asset.r2_key);
    if (!original) throw new Error("Private original is missing from R2.");
    if (asset.storage_etag && original.httpEtag !== asset.storage_etag) {
      throw new Error("Private original ETag does not match D1.");
    }
    const source = await original.arrayBuffer();
    if (await sha256Buffer(source) !== asset.sha256) throw new Error("Private original checksum does not match D1.");

    const widths = mediaDerivativeWidths(asset.normalized_width);
    const requiredVariantCount = widths.length * 2;
    let readyVariantCount = 0;
    let optionalVariantCount = 0;

    for (const width of widths) {
      for (const format of ["jpeg", "webp", "avif"] as const) {
        if (format === "avif" && width > MEDIA_AVIF_MAX_WIDTH) continue;
        try {
          const transformed = await transformVariant(images, source, asset, width, format);
          const key = derivativeKey(asset.id, asset.sha256, width, format);
          const stored = await bucket.put(key, transformed.buffer, {
            httpMetadata: {
              contentType: transformed.mimeType,
              cacheControl: "public, max-age=31536000, s-maxage=31536000, immutable",
            },
          });
          const record = database.prepare(
            "INSERT OR REPLACE INTO media_derivatives (id, media_id, policy_version, source_sha256, variant_width, format, mime_type, r2_key, width, height, byte_size, sha256, storage_etag, status, generation_token, generated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
          );
          try {
            const recorded = await record.bind(
              `derivative_${crypto.randomUUID()}`,
              asset.id,
              MEDIA_DERIVATIVE_POLICY_VERSION,
              asset.sha256,
              width,
              format,
              transformed.mimeType,
              key,
              transformed.width,
              transformed.height,
              transformed.buffer.byteLength,
              transformed.sha256,
              stored.httpEtag,
              leaseId,
            ).run();
            if (!recorded.success) throw new Error("Derivative metadata could not be committed.");
          } catch (error) {
            await bucket.delete(key);
            throw error;
          }
          if (MEDIA_DERIVATIVE_FORMATS[format].required) readyVariantCount += 1;
          else optionalVariantCount += 1;
        } catch (error) {
          if (MEDIA_DERIVATIVE_FORMATS[format].required) throw error;
          console.warn(`Optional ${format} derivative unavailable for ${asset.id} at ${width}px.`, error);
        }
      }
    }

    if (readyVariantCount !== requiredVariantCount) throw new Error("Required JPEG/WebP derivative matrix is incomplete.");
    const finalized = await database.prepare(
      `UPDATE media_derivative_jobs
       SET status = 'ready', generation_token = NULL, lock_expires_at = NULL,
           required_variant_count = ?, ready_variant_count = ?, optional_variant_count = ?,
           last_error_code = NULL, last_error_message = NULL,
           completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE media_id = ? AND generation_token = ?
         AND policy_version = ? AND source_sha256 = ?`,
    ).bind(
      requiredVariantCount,
      readyVariantCount,
      optionalVariantCount,
      asset.id,
      leaseId,
      MEDIA_DERIVATIVE_POLICY_VERSION,
      asset.sha256,
    ).run();
    if (!finalized.success || (finalized.meta.changes ?? 0) !== 1) {
      throw new Error("Derivative generation lost its D1 lease.");
    }
    await cleanupStaleMediaDerivatives(asset.id, MEDIA_DERIVATIVE_POLICY_VERSION, asset.sha256);
    return { ok: true as const, status: "generated" as const, generated: readyVariantCount, optional: optionalVariantCount };
  } catch (error) {
    await markJobFailed(asset.id, leaseId, error);
    throw error;
  }
}

async function cleanupStaleMediaDerivatives(mediaId: string, policyVersion: string, sourceSha256: string): Promise<number> {
  const database = getDatabase();
  const bucket = getBucket();
  if (!database || !bucket) return 0;
  const rows = await database.prepare(
    `SELECT id, r2_key FROM media_derivatives
     WHERE media_id = ? AND (policy_version <> ? OR source_sha256 <> ? OR status = 'deleting')`,
  ).bind(mediaId, policyVersion, sourceSha256).all<{ id: string; r2_key: string }>();
  let cleaned = 0;
  for (const row of rows.results ?? []) {
    await bucket.delete(row.r2_key);
    const removed = await database.prepare("DELETE FROM media_derivatives WHERE id = ?").bind(row.id).run();
    if (removed.success && (removed.meta.changes ?? 0) === 1) cleaned += 1;
  }
  return cleaned;
}

export async function cleanupMediaDerivatives(mediaId: string, options: { deleteOriginal?: boolean } = {}) {
  const database = getDatabase();
  const bucket = getBucket();
  if (!database || !bucket) throw new Error("Media cleanup dependencies are not configured.");
  const asset = await database.prepare(
    "SELECT id, r2_key FROM media_assets WHERE id = ? LIMIT 1",
  ).bind(mediaId).first<{ id: string; r2_key: string }>();
  if (!asset) return { ok: false as const, cleaned: 0 };

  const rows = await database.prepare(
    "SELECT id, r2_key FROM media_derivatives WHERE media_id = ?",
  ).bind(mediaId).all<{ id: string; r2_key: string }>();
  let cleaned = 0;
  for (const row of rows.results ?? []) {
    await bucket.delete(row.r2_key);
    const removed = await database.prepare("DELETE FROM media_derivatives WHERE id = ?").bind(row.id).run();
    if (removed.success && (removed.meta.changes ?? 0) === 1) cleaned += 1;
  }
  if (options.deleteOriginal) await bucket.delete(asset.r2_key);
  await database.prepare(
    `UPDATE media_derivative_jobs
     SET status = 'cleaned', generation_token = NULL, lock_expires_at = NULL,
         required_variant_count = 0, ready_variant_count = 0, optional_variant_count = 0,
         completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE media_id = ?`,
  ).bind(mediaId).run();
  return { ok: true as const, cleaned };
}

function preferredFormats(accept: string, requested?: string | null): MediaDerivativeFormat[] {
  if (requested === "avif" || requested === "webp" || requested === "jpeg") return [requested];
  const formats: MediaDerivativeFormat[] = [];
  if (accept.includes("image/avif")) formats.push("avif");
  if (accept.includes("image/webp")) formats.push("webp");
  formats.push("jpeg");
  return [...new Set(formats)];
}

export async function findReadyMediaDerivative(input: {
  mediaId: string;
  sourceSha256: string;
  requestedWidth?: number | null;
  requestedFormat?: string | null;
  accept?: string;
}): Promise<MediaDerivativeRow | null> {
  const database = getDatabase();
  if (!database) return null;
  const formats = preferredFormats(input.accept ?? "", input.requestedFormat);
  const candidates = await database.prepare(
    `SELECT media_derivatives.id, media_derivatives.media_id, media_derivatives.policy_version,
            media_derivatives.source_sha256, media_derivatives.variant_width, media_derivatives.format,
            media_derivatives.mime_type, media_derivatives.r2_key, media_derivatives.width,
            media_derivatives.height, media_derivatives.byte_size, media_derivatives.sha256,
            media_derivatives.storage_etag, media_derivatives.status
     FROM media_derivatives
     INNER JOIN media_derivative_jobs ON media_derivative_jobs.media_id = media_derivatives.media_id
     WHERE media_derivatives.media_id = ?
       AND media_derivatives.policy_version = ?
       AND media_derivatives.source_sha256 = ?
       AND media_derivatives.status = 'ready'
       AND media_derivative_jobs.status = 'ready'
       AND media_derivative_jobs.policy_version = media_derivatives.policy_version
       AND media_derivative_jobs.source_sha256 = media_derivatives.source_sha256
       AND media_derivative_jobs.ready_variant_count >= media_derivative_jobs.required_variant_count
       AND media_derivative_jobs.required_variant_count > 0`,
  ).bind(input.mediaId, MEDIA_DERIVATIVE_POLICY_VERSION, input.sourceSha256).all<MediaDerivativeRow>();
  const rows = candidates.results ?? [];
  if (!rows.length) return null;
  const requestedWidth = Number.isInteger(input.requestedWidth) && Number(input.requestedWidth) > 0
    ? Number(input.requestedWidth)
    : 960;
  for (const format of formats) {
    const byFormat = rows
      .filter((row) => row.format === format)
      .sort((left, right) => left.variant_width - right.variant_width);
    if (!byFormat.length) continue;
    return byFormat.find((row) => row.variant_width >= requestedWidth) ?? byFormat.at(-1) ?? null;
  }
  return null;
}
