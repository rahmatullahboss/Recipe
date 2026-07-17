import type { APIRoute } from "astro";
import { listOwnedMedia } from "../../../lib/media";

export const GET: APIRoute = async ({ locals, url }) => {
  if (!locals.authReady || !locals.user || !locals.session) {
    return Response.json({ ok: false, error: "A verified account is required." }, {
      status: 401,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const requestedLimit = Number(url.searchParams.get("limit") ?? "20");
  const assets = await listOwnedMedia(locals.user.id, Number.isFinite(requestedLimit) ? requestedLimit : 20);
  return Response.json({
    ok: true,
    assets: assets.map((asset) => ({
      id: asset.id,
      key: asset.r2_key,
      mimeType: asset.mime_type,
      width: asset.width,
      height: asset.height,
      byteSize: asset.byte_size,
      altText: asset.alt_text,
      uploadStatus: asset.upload_status,
      moderationStatus: asset.moderation_status,
      createdAt: asset.created_at,
      previewUrl: `/media/${asset.r2_key}?preview=1`,
    })),
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
};
