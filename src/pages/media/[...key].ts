import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { findMediaAssetByKey } from "../../lib/media";

type OptionalBindings = { MEDIA?: R2Bucket };

function validKey(value: string): boolean {
  return value.length > 0
    && value.length <= 512
    && !value.startsWith("/")
    && !value.includes("..")
    && !value.includes("\\")
    && /^[a-zA-Z0-9/_\-.]+$/.test(value);
}

async function serveMedia({ params, request, locals }: Parameters<APIRoute>[0], headOnly = false): Promise<Response> {
  const key = params.key ?? "";
  if (!validKey(key)) return new Response("Media not found", { status: 404 });

  const asset = await findMediaAssetByKey(key);
  if (!asset || asset.upload_status !== "uploaded") return new Response("Media not found", { status: 404 });

  const previewRequested = new URL(request.url).searchParams.get("preview") === "1";
  const isEditorial = locals.user?.role === "editor" || locals.user?.role === "admin";
  const isOwnerPendingPreview = Boolean(
    previewRequested
    && locals.user
    && asset.owner_id === locals.user.id
    && asset.moderation_status === "pending",
  );
  const isEditorialPreview = Boolean(previewRequested && locals.user && isEditorial);
  const publicAsset = asset.moderation_status === "approved";

  if (!publicAsset && !isOwnerPendingPreview && !isEditorialPreview) {
    return new Response("Media not found", { status: 404 });
  }

  const media = (env as unknown as OptionalBindings).MEDIA;
  if (!media) return new Response("Media storage is not configured", { status: 503 });

  const object = await media.get(key);
  if (!object) return new Response("Media not found", { status: 404 });

  if (request.headers.get("if-none-match") === object.httpEtag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: object.httpEtag },
    });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", asset.mime_type);
  headers.set("Content-Length", String(object.size));
  headers.set("Content-Disposition", "inline");
  headers.set("ETag", object.httpEtag);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cross-Origin-Resource-Policy", "same-site");

  if (publicAsset) {
    headers.set("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
  } else {
    headers.set("Cache-Control", "private, no-store");
    headers.set("Vary", "Cookie");
  }

  return new Response(headOnly ? null : object.body, { headers });
}

export const GET: APIRoute = async (context) => serveMedia(context, false);
export const HEAD: APIRoute = async (context) => serveMedia(context, true);
