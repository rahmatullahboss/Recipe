import type { APIRoute } from "astro";
import { hasDatabase } from "../../lib/db";

export const GET: APIRoute = async () => {
  return Response.json(
    {
      ok: true,
      service: "ozzyl-recipes",
      runtime: "cloudflare-workers",
      dataMode: hasDatabase() ? "d1" : "static-fallback",
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
};
