import type { APIRoute } from "astro";
import { isSameOriginRequest } from "../../../lib/auth";
import {
  MAX_MEDIA_BYTES,
  claimUploadIntent,
  findPendingUploadIntent,
  getMediaReadiness,
  markUploadIntentFailed,
  storeValidatedImage,
  validateImageBytes,
} from "../../../lib/media";
import { getMediaRuntimeStatus } from "../../../lib/media-runtime";
import { generateMediaDerivatives } from "../../../lib/media-derivatives";

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function readBearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

export const PUT: APIRoute = async ({ request, locals }) => {
  if (!locals.authReady || !locals.user || !locals.session) {
    return json({ ok: false, error: "A verified account is required." }, 401);
  }
  if (!getMediaRuntimeStatus().uploadsEnabled) {
    return json({ ok: false, error: "Contributor media uploads are not enabled." }, 503);
  }
  if (!getMediaReadiness().ready) return json({ ok: false, error: "Media storage is not configured." }, 503);
  if (!isSameOriginRequest(request)) return json({ ok: false, error: "Invalid upload origin." }, 403);

  const token = readBearerToken(request);
  if (!token) return json({ ok: false, error: "Upload authorization is missing." }, 401);

  const intent = await findPendingUploadIntent(token, locals.user.id);
  if (!intent) return json({ ok: false, error: "Upload authorization is invalid or expired." }, 401);

  const declaredMimeType = (request.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;

  if (declaredMimeType !== intent.mime_type) {
    await markUploadIntentFailed(intent.id);
    return json({ ok: false, error: "Upload content type does not match the authorization." }, 415);
  }
  if (contentLength !== null && (!Number.isInteger(contentLength) || contentLength < 1 || contentLength > MAX_MEDIA_BYTES || contentLength !== intent.byte_size)) {
    await markUploadIntentFailed(intent.id);
    return json({ ok: false, error: "Upload size does not match the authorization." }, 413);
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await request.arrayBuffer();
  } catch {
    await markUploadIntentFailed(intent.id);
    return json({ ok: false, error: "The image body could not be read." }, 400);
  }

  if (buffer.byteLength !== intent.byte_size || buffer.byteLength > MAX_MEDIA_BYTES) {
    await markUploadIntentFailed(intent.id);
    return json({ ok: false, error: "Uploaded bytes do not match the authorized size." }, 413);
  }

  let asset: Awaited<ReturnType<typeof storeValidatedImage>>;
  try {
    const image = await validateImageBytes(buffer, declaredMimeType);
    const claimed = await claimUploadIntent(intent.id);
    if (!claimed) return json({ ok: false, error: "This upload authorization has already been used." }, 409);
    asset = await storeValidatedImage(intent, buffer, image);
  } catch (error) {
    await markUploadIntentFailed(intent.id);
    const message = error instanceof Error ? error.message : "The image could not be accepted.";
    return json({ ok: false, error: message }, 422);
  }

  try {
    const derivatives = await generateMediaDerivatives(asset.id);
    return json({ ok: true, asset: { ...asset, derivativeStatus: derivatives.status } }, 201);
  } catch (error) {
    console.error("Privacy-safe derivative generation failed after the private original was accepted.", error);
    return json({
      ok: true,
      asset: { ...asset, derivativeStatus: "failed" },
      warning: "The private original was stored, but public-safe previews are not ready. Regeneration is required before approval.",
    }, 201);
  }
};
