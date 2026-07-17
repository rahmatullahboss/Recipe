import { env } from "cloudflare:workers";
import type { MediaModerationStatus } from "./media";

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
       AND moderation_status <> ?`,
  ).bind(
    input.nextStatus,
    reason,
    input.moderatorId,
    input.mediaId,
    input.nextStatus,
  ).run();

  return Boolean(result.success && (result.meta.changes ?? 0) === 1);
}
