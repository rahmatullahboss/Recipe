import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { fallbackRecipes } from "../../data/fallback-recipes";
import { getAuthReadiness } from "../../lib/auth";
import { hasDatabase } from "../../lib/db";
import { markets } from "../../lib/market";
import { getMediaReadiness } from "../../lib/media";
import { getMediaDerivativeReadiness } from "../../lib/media-derivatives";
import { getMediaRuntimeStatus } from "../../lib/media-runtime";
import { getRecipeSubmissionReadiness } from "../../lib/recipe-submissions";

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
  const derivatives = getMediaDerivativeReadiness();
  const mediaRuntime = getMediaRuntimeStatus();
  const recipeSubmissions = getRecipeSubmissionReadiness();

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
        storageReady: media.database && media.storage,
        transformationsReady: media.transformations,
        ready: mediaRuntime.uploadsEnabled && derivatives.ready && auth.ready,
        database: media.database,
        storage: media.storage,
        transformations: derivatives.transformations,
        maximumUploadBytes: media.maxBytes,
        allowedMimeTypeCount: media.allowedMimeTypes.length,
        derivativePolicyVersion: derivatives.policyVersion,
        derivativeWidths: derivatives.widths,
        requiredFormats: derivatives.requiredFormats,
        optionalFormats: derivatives.optionalFormats,
        avifMaxWidth: derivatives.avifMaxWidth,
        originalPublicDelivery: derivatives.originalPublicDelivery,
        publicDeliveryRequiresApproval: derivatives.approvalRequired,
        publicDeliveryRequiresReadyDerivatives: derivatives.readyDerivativesRequired,
        orientationNormalization: derivatives.orientationNormalization,
        metadataStrippingVerified: derivatives.metadataStrippingVerified,
        deterministicKeys: derivatives.deterministicKeys,
        idempotentLocks: derivatives.idempotentLocks,
        checksumRegeneration: derivatives.checksumRegeneration,
        cleanupLifecycle: derivatives.cleanupLifecycle,
      },
      recipeSubmissions: {
        enabled: recipeSubmissions.enabled,
        ready: recipeSubmissions.ready,
        database: recipeSubmissions.database,
        authentication: recipeSubmissions.authentication,
        mediaUploads: recipeSubmissions.mediaUploads,
        mediaStorage: recipeSubmissions.mediaStorage,
        missingCount: recipeSubmissions.missing.length,
        publicationRequiresApprovedMedia: true,
        contributorRevisions: true,
        requestedChanges: true,
        immutableSnapshots: true,
        optimisticLocking: true,
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
