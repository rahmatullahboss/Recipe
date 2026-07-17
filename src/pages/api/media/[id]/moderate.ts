import type { APIRoute } from "astro";
import { CSRF_COOKIE, isSameOriginRequest, validateCsrfToken } from "../../../../lib/auth";
import { moderateMediaAsset, type MediaModerationStatus } from "../../../../lib/media";

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export const POST: APIRoute = async ({ request, cookies, locals, params }) => {
  if (!locals.authReady || !locals.user || !locals.session) {
    return json({ ok: false, error: "A verified account is required." }, 401);
  }
  if (locals.user.role !== "editor" && locals.user.role !== "admin") {
    return json({ ok: false, error: "Editorial permission is required." }, 403);
  }
  if (!isSameOriginRequest(request)) return json({ ok: false, error: "Invalid moderation origin." }, 403);

  let input: Record<string, unknown>;
  try {
    input = await request.json<Record<string, unknown>>();
  } catch {
    return json({ ok: false, error: "Moderation request must be valid JSON." }, 400);
  }

  const nonce = cookies.get(CSRF_COOKIE)?.value;
  const csrfValid = await validateCsrfToken("media-moderate", nonce, input.csrfToken);
  if (!csrfValid || input.sessionCsrf !== locals.session.csrfToken) {
    return json({ ok: false, error: "Moderation authorization expired." }, 403);
  }

  const status = input.status;
  const allowed = new Set<MediaModerationStatus>(["pending", "approved", "rejected", "quarantined"]);
  if (typeof status !== "string" || !allowed.has(status as MediaModerationStatus)) {
    return json({ ok: false, error: "Select a valid moderation status." }, 422);
  }

  const mediaId = params.id?.trim() ?? "";
  if (!mediaId || mediaId.length > 100) return json({ ok: false, error: "Invalid media asset." }, 400);

  try {
    const updated = await moderateMediaAsset({
      mediaId,
      moderatorId: locals.user.id,
      nextStatus: status as MediaModerationStatus,
      reason: typeof input.reason === "string" ? input.reason : undefined,
    });
    if (!updated) return json({ ok: false, error: "Media asset was not found or changed concurrently." }, 409);
    return json({ ok: true, mediaId, moderationStatus: status });
  } catch (error) {
    console.error("Media moderation failed.", error);
    return json({ ok: false, error: "Media moderation is temporarily unavailable." }, 503);
  }
};
