import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { fallbackRecipes } from "../../data/fallback-recipes";
import { hasDatabase } from "../../lib/db";
import { markets } from "../../lib/market";

type OptionalBindings = {
  DB?: D1Database;
  SESSION?: KVNamespace;
  MEDIA?: R2Bucket;
  IMAGES?: unknown;
  DATA_MODE?: string;
};

export const GET: APIRoute = async () => {
  const bindings = env as unknown as OptionalBindings;
  const d1Bound = hasDatabase();

  return Response.json(
    {
      ok: true,
      service: "ozzyl-recipes",
      runtime: "cloudflare-workers",
      dataMode: d1Bound ? "d1" : "static-fallback",
      configuredDataMode: bindings.DATA_MODE ?? null,
      catalogue: {
        fallbackRecipes: fallbackRecipes.length,
        supportedMarkets: markets.length,
      },
      bindings: {
        d1: d1Bound,
        kv: Boolean(bindings.SESSION),
        r2: Boolean(bindings.MEDIA),
        images: Boolean(bindings.IMAGES),
      },
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
};
