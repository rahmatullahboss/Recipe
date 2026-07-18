import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { CSRF_COOKIE, isSameOriginRequest, validateCsrfToken } from "../../../lib/auth";
import { cleanupMediaDerivatives } from "../../../lib/media-derivatives";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export const DELETE: APIRoute = async ({ request, cookies, locals, params }) => {
  if (!locals.authReady || !locals.user || !locals.session) {
    return json({ ok: false, error: "A verified account is required." }, 401);
  }
  if (!isSameOriginRequest(request)) return json({ ok: false, error: "Invalid media deletion origin." }, 403);

  let input: Record<string, unknown>;
  try {
    input = await request.json<Record<string, unknown>>();
  } catch {
    return json({ ok: false, error: "Media deletion request must be valid JSON." }, 400);
  }
  const nonce = cookies.get(CSRF_COOKIE)?.value;
  const csrfValid = await validateCsrfToken("media-delete", nonce, input.csrfToken);
  if (!csrfValid || input.sessionCsrf !== locals.session.csrfToken) {
    return json({ ok: false, error: "Media deletion authorization expired." }, 403);
  }

  const mediaId = params.id?.trim() ?? "";
  if (!mediaId || mediaId.length > 100) return json({ ok: false, error: "Invalid media asset." }, 400);
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) return json({ ok: false, error: "Media database is not configured." }, 503);
  const asset = await database.prepare(
    "SELECT owner_id, upload_status FROM media_assets WHERE id = ? LIMIT 1",
  ).bind(mediaId).first<{ owner_id: string | null; upload_status: string }>();
  if (!asset || asset.upload_status === "deleted") return json({ ok: false, error: "Media asset was not found." }, 404);

  const isEditorial = locals.user.role === "editor" || locals.user.role === "admin";
  if (!isEditorial && asset.owner_id !== locals.user.id) return json({ ok: false, error: "Media ownership is required." }, 403);
  const assigned = await database.prepare(
    `SELECT 'recipe' AS reference_type, id AS reference_id
     FROM recipes
     WHERE media_asset_id = ?
     UNION ALL
     SELECT 'change_set' AS reference_type, id AS reference_id
     FROM recipe_change_sets
     WHERE media_asset_id = ? AND status IN ('draft', 'review', 'changes_requested')
     LIMIT 1`,
  ).bind(mediaId, mediaId).first<{ reference_type: string; reference_id: string }>();
  if (assigned) {
    return json({
      ok: false,
      error: assigned.reference_type === "change_set"
        ? "Detach this image from its active private recipe update before deleting it."
        : "Detach this image from its recipe before deleting it.",
    }, 409);
  }

  const updated = await database.prepare(
    `UPDATE media_assets
     SET upload_status = 'deleted', original_deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND upload_status <> 'deleted'`,
  ).bind(mediaId).run();
  if (!updated.success || (updated.meta.changes ?? 0) !== 1) {
    return json({ ok: false, error: "Media asset changed concurrently." }, 409);
  }

  try {
    const cleanup = await cleanupMediaDerivatives(mediaId, { deleteOriginal: true });
    return json({ ok: true, mediaId, cleanedDerivatives: cleanup.cleaned });
  } catch (error) {
    console.error("Media deletion cleanup is pending.", error);
    return json({ ok: true, mediaId, cleanupPending: true }, 202);
  }
};
