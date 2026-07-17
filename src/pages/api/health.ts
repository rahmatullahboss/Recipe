import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  return Response.json(
    {
      ok: true,
      service: "ozzyl-recipes",
      runtime: "cloudflare-workers",
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
};
