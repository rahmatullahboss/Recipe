import { env } from "cloudflare:workers";
import type { MediaModerationStatus } from "./media";
import { MEDIA_DERIVATIVE_POLICY_VERSION } from "./media-policy";

export async function applyMediaModeration(input: {
  mediaId: string;
  moderatorId: string;
  nextStatus: MediaModerationStatus;
  reason?: string;
}): Promise<boolean> {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) throw new Error("Media moderation database is not configured.");

  const reason = input.reason?.trim().slice(0, 1000) || null;
  const result = await database.prepare(
    `UPDATE media_assets
     SET moderation_status = ?,
         moderation_reason = ?,
         moderated_by = ?,
         moderated_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND upload_status = 'uploaded'
       AND moderation_status <> ?
       AND (
         ? <> 'approved'
         OR EXISTS (
           SELECT 1
           FROM media_derivative_jobs
           WHERE media_derivative_jobs.media_id = media_assets.id
             AND media_derivative_jobs.status = 'ready'
             AND media_derivative_jobs.policy_version = ?
             AND media_derivative_jobs.source_sha256 = media_assets.sha256
             AND media_derivative_jobs.required_variant_count > 0
             AND media_derivative_jobs.ready_variant_count >= media_derivative_jobs.required_variant_count
         )
       )`,
  ).bind(
    input.nextStatus,
    reason,
    input.moderatorId,
    input.mediaId,
    input.nextStatus,
    input.nextStatus,
    MEDIA_DERIVATIVE_POLICY_VERSION,
  ).run();

  const updated = Boolean(result.success && (result.meta.changes ?? 0) === 1);
  if (updated && input.nextStatus === "pending") {
    await database.prepare(
      `UPDATE media_derivative_jobs
       SET status = CASE WHEN status IN ('cleaned', 'failed', 'cleanup_pending') THEN 'pending' ELSE status END,
           generation_token = NULL,
           lock_expires_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE media_id = ?`,
    ).bind(input.mediaId).run();
  }
  return updated;
}
