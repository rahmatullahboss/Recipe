import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { fallbackRecipes } from "../../data/fallback-recipes";
import { getAuthReadiness } from "../../lib/auth";
import { hasDatabase } from "../../lib/db";
import { markets } from "../../lib/market";
import { getMediaReadiness } from "../../lib/media";
import { getMediaRuntimeStatus } from "../../lib/media-runtime";

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
  const auth = getAuthReadiness();
  const media = getMediaReadiness();
  const mediaRuntime = getMediaRuntimeStatus();

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
      authentication: {
        enabled: auth.enabled,
        ready: auth.ready,
        registrationEnabled: auth.registrationEnabled,
        registrationReady: auth.registrationReady,
        database: auth.database,
        sessions: auth.sessions,
        turnstileSiteKey: auth.turnstileSiteKey,
        turnstileSecret: auth.turnstileSecret,
        passwordPepper: auth.passwordPepper,
        emailDelivery: auth.emailDelivery,
        missingCount: auth.missing.length,
        registrationMissingCount: auth.registrationMissing.length,
      },
      media: {
        uploadsEnabled: mediaRuntime.uploadsEnabled,
        storageReady: media.ready,
        ready: mediaRuntime.uploadsEnabled && media.ready && auth.ready,
        database: media.database,
        storage: media.storage,
        maximumUploadBytes: media.maxBytes,
        allowedMimeTypeCount: media.allowedMimeTypes.length,
        publicDeliveryRequiresApproval: true,
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
