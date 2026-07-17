import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

type OptionalBindings = { MEDIA?: R2Bucket };

export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key;
  if (!key) return new Response("Missing media key", { status: 400 });

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
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800, immutable");

  return new Response(object.body, { headers });
};
