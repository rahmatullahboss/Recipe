import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { CSRF_COOKIE, isSameOriginRequest, validateCsrfToken } from "../../../../lib/auth";
import { generateMediaDerivatives } from "../../../../lib/media-derivatives";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export const POST: APIRoute = async ({ request, cookies, locals, params }) => {
  if (!locals.authReady || !locals.user || !locals.session) {
    return json({ ok: false, error: "A verified account is required." }, 401);
  }
  if (!isSameOriginRequest(request)) return json({ ok: false, error: "Invalid derivative origin." }, 403);

  let input: Record<string, unknown>;
  try {
    input = await request.json<Record<string, unknown>>();
  } catch {
    return json({ ok: false, error: "Derivative request must be valid JSON." }, 400);
  }
  const nonce = cookies.get(CSRF_COOKIE)?.value;
  const csrfValid = await validateCsrfToken("media-derivatives", nonce, input.csrfToken);
  if (!csrfValid || input.sessionCsrf !== locals.session.csrfToken) {
    return json({ ok: false, error: "Derivative authorization expired." }, 403);
  }

  const mediaId = params.id?.trim() ?? "";
  if (!mediaId || mediaId.length > 100) return json({ ok: false, error: "Invalid media asset." }, 400);
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) return json({ ok: false, error: "Media database is not configured." }, 503);
  const asset = await database.prepare(
    "SELECT owner_id, upload_status, moderation_status FROM media_assets WHERE id = ? LIMIT 1",
  ).bind(mediaId).first<{ owner_id: string | null; upload_status: string; moderation_status: string }>();
  if (!asset || asset.upload_status !== "uploaded") return json({ ok: false, error: "Media asset was not found." }, 404);

  const isEditorial = locals.user.role === "editor" || locals.user.role === "admin";
  if (!isEditorial && asset.owner_id !== locals.user.id) {
    return json({ ok: false, error: "Media ownership is required." }, 403);
  }
  if (asset.moderation_status === "rejected" || asset.moderation_status === "quarantined") {
    return json({ ok: false, error: "Rejected or quarantined media cannot be regenerated." }, 409);
  }

  try {
    const result = await generateMediaDerivatives(mediaId, { force: isEditorial && input.force === true });
    if (!result.ok && result.status === "busy") {
      return json({ ok: false, error: "Derivative generation is already in progress." }, 409);
    }
    return json({ ok: result.ok, mediaId, derivativeStatus: result.status });
  } catch (error) {
    console.error("Guarded media derivative generation failed.", error);
    return json({ ok: false, error: "Privacy-safe derivative generation failed." }, 503);
  }
};
