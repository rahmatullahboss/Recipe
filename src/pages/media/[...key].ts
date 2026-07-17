import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { findReadyMediaDerivative } from "../../lib/media-derivatives";
import { findMediaAssetByKey } from "../../lib/media";
import { mediaDerivativeCacheToken } from "../../lib/media-policy";

type OptionalBindings = { MEDIA?: R2Bucket };

function validKey(value: string): boolean {
  return value.length > 0
    && value.length <= 512
    && !value.startsWith("/")
    && !value.includes("..")
    && !value.includes("\\")
    && /^[a-zA-Z0-9/_\-.]+$/.test(value);
}

function privateHeaders(): HeadersInit {
  return {
    "Cache-Control": "private, no-store",
    "Vary": "Cookie, Accept",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-site",
  };
}

function parseWidth(value: string | null): number | null {
  if (!value) return null;
  const width = Number(value);
  return Number.isInteger(width) && width >= 1 && width <= 4096 ? width : null;
}

async function serveMedia({ params, request, locals }: Parameters<APIRoute>[0], headOnly = false): Promise<Response> {
  const key = params.key ?? "";
  if (!validKey(key)) return new Response("Media not found", { status: 404 });

  const asset = await findMediaAssetByKey(key);
  if (!asset || asset.upload_status !== "uploaded" || !asset.sha256) {
    return new Response("Media not found", { status: 404 });
  }

  const url = new URL(request.url);
  const previewRequested = url.searchParams.get("preview") === "1";
  const isEditorial = locals.user?.role === "editor" || locals.user?.role === "admin";
  const isOwnerPreview = Boolean(
    previewRequested
    && locals.user
    && asset.owner_id === locals.user.id
    && (asset.moderation_status === "pending" || asset.moderation_status === "approved"),
  );
  const isEditorialPreview = Boolean(previewRequested && locals.user && isEditorial);
  const privatePreview = isOwnerPreview || isEditorialPreview;
  const publicAsset = asset.moderation_status === "approved";
  if (!publicAsset && !privatePreview) return new Response("Media not found", { status: 404 });
  if (previewRequested && !privatePreview) return new Response("Media not found", { status: 404 });

  const cacheVersion = mediaDerivativeCacheToken(asset.sha256);
  if (!privatePreview && url.searchParams.get("v") !== cacheVersion) {
    url.searchParams.delete("preview");
    url.searchParams.set("v", cacheVersion);
    return Response.redirect(url, 307);
  }

  const requestedFormat = url.searchParams.get("format");
  if (requestedFormat && !["jpeg", "webp", "avif"].includes(requestedFormat)) {
    return new Response("Media not found", { status: 404 });
  }
  const derivative = await findReadyMediaDerivative({
    mediaId: asset.id,
    sourceSha256: asset.sha256,
    requestedWidth: parseWidth(url.searchParams.get("w")),
    requestedFormat,
    accept: request.headers.get("accept") ?? "",
  });
  if (!derivative) {
    return new Response(privatePreview ? "Private preview is not ready" : "Media not found", {
      status: privatePreview ? 503 : 404,
      headers: privateHeaders(),
    });
  }

  const media = (env as unknown as OptionalBindings).MEDIA;
  if (!media) return new Response("Media storage is not configured", { status: 503, headers: privateHeaders() });
  const object = await media.get(derivative.r2_key);
  if (!object || object.httpEtag !== derivative.storage_etag || object.size !== derivative.byte_size) {
    return new Response("Media derivative is unavailable", { status: 503, headers: privateHeaders() });
  }

  const headers = new Headers();
  headers.set("Content-Type", derivative.mime_type);
  headers.set("Content-Length", String(object.size));
  headers.set("Content-Disposition", "inline");
  headers.set("ETag", derivative.storage_etag);
  headers.set("X-Content-SHA256", derivative.sha256);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cross-Origin-Resource-Policy", "same-site");
  headers.set("Vary", privatePreview ? "Cookie, Accept" : "Accept");
  headers.set(
    "Cache-Control",
    privatePreview
      ? "private, no-store"
      : "public, max-age=31536000, s-maxage=31536000, immutable",
  );

  if (request.headers.get("if-none-match") === derivative.storage_etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(headOnly ? null : object.body, { headers });
}

export const GET: APIRoute = async (context) => serveMedia(context, false);
export const HEAD: APIRoute = async (context) => serveMedia(context, true);
