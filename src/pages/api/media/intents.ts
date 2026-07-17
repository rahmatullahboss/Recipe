import type { APIRoute } from "astro";
import {
  CSRF_COOKIE,
  consumeRateLimit,
  isSameOriginRequest,
  validateCsrfToken,
} from "../../../lib/auth";
import { createMediaUploadIntent, getMediaReadiness } from "../../../lib/media";
import { getMediaRuntimeStatus } from "../../../lib/media-runtime";

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.authReady || !locals.user || !locals.session) {
    return json({ ok: false, error: "Sign in with a verified account before uploading media." }, 401);
  }
  if (!getMediaRuntimeStatus().uploadsEnabled) {
    return json({ ok: false, error: "Contributor media uploads are not enabled." }, 503);
  }
  if (!getMediaReadiness().ready) {
    return json({ ok: false, error: "Media storage is not configured." }, 503);
  }
  if (!isSameOriginRequest(request)) {
    return json({ ok: false, error: "Invalid upload request." }, 403);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 16_384) return json({ ok: false, error: "Upload intent request is too large." }, 413);

  let input: Record<string, unknown>;
  try {
    input = await request.json<Record<string, unknown>>();
  } catch {
    return json({ ok: false, error: "Upload intent must be valid JSON." }, 400);
  }

  const csrfNonce = cookies.get(CSRF_COOKIE)?.value;
  const csrfValid = await validateCsrfToken("media-intent", csrfNonce, input.csrfToken);
  if (!csrfValid || input.sessionCsrf !== locals.session.csrfToken) {
    return json({ ok: false, error: "Upload authorization expired. Reload the page and try again." }, 403);
  }

  const allowed = await consumeRateLimit(request, "media-intent", locals.user.id, 30, 60 * 60);
  if (!allowed) return json({ ok: false, error: "Too many upload requests. Try again later." }, 429);

  try {
    const result = await createMediaUploadIntent(locals.user.id, {
      filename: input.filename,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      purpose: input.purpose,
      altText: input.altText,
    });
    if (!result.ok) return json({ ok: false, errors: result.errors }, 422);
    return json(result, 201);
  } catch (error) {
    console.error("Media upload intent could not be created.", error);
    return json({ ok: false, error: "Upload authorization is temporarily unavailable." }, 503);
  }
};
