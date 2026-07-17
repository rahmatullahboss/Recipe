import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key;
  if (!key) return new Response("Missing media key", { status: 400 });

  const object = await env.MEDIA.get(key, {
    onlyIf: request.headers,
  });

  if (!object) return new Response("Media not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800, immutable");

  return new Response(object.body, { headers });
};
