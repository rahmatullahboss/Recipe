import type { APIRoute } from "astro";

export const POST: APIRoute = async () => Response.json(
  { ok: false, error: "Recipe submissions are not configured." },
  { status: 503, headers: { "Cache-Control": "private, no-store" } },
);
