import type { APIRoute } from "astro";
import { CSRF_COOKIE, consumeRateLimit, isSameOriginRequest, validateCsrfToken } from "../../../../lib/auth";
import {
  rebaseRecipeChangeSet,
  type RecipeConflictChoice,
  type RecipeConflictUnitKey,
} from "../../../../lib/recipe-change-set-conflicts";
import { RecipeSubmissionError } from "../../../../lib/recipe-submissions";

const MAX_BODY_BYTES = 20_000;
const ALLOWED_KEYS = new Set<RecipeConflictUnitKey>([
  "title",
  "summary",
  "description",
  "mediaAssetId",
  "countryCode",
  "languageCode",
  "measurementSystem",
  "prepMinutes",
  "cookMinutes",
  "servings",
  "difficulty",
  "categories",
  "ingredients",
  "steps",
]);

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export const POST: APIRoute = async ({ request, cookies, locals, params }) => {
  if (!locals.authReady || !locals.user || !locals.session) {
    return json({ ok: false, error: "A verified account is required." }, 401);
  }
  if (!isSameOriginRequest(request)) return json({ ok: false, error: "Invalid request origin." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return json({ ok: false, error: "Send application/json." }, 415);
  }
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "Conflict resolution payload is too large." }, 413);
  }

  const changeSetId = params.id?.trim() ?? "";
  if (!/^recipe_change_[0-9a-f-]{36}$/i.test(changeSetId)) {
    return json({ ok: false, error: "Change-set identifier is invalid." }, 400);
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json<Record<string, unknown>>();
  } catch {
    return json({ ok: false, error: "Conflict resolution JSON could not be read." }, 400);
  }

  const nonce = cookies.get(CSRF_COOKIE)?.value;
  const csrfValid = await validateCsrfToken("recipe-change-set-rebase", nonce, input.csrfToken);
  if (!csrfValid || input.sessionCsrf !== locals.session.csrfToken) {
    return json({ ok: false, error: "Conflict resolution authorization expired." }, 403);
  }

  const expectedRevision = Number(input.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    return json({ ok: false, error: "Change-set revision is invalid." }, 422);
  }

  const rawResolutions = input.resolutions;
  if (!rawResolutions || typeof rawResolutions !== "object" || Array.isArray(rawResolutions)) {
    return json({ ok: false, error: "Conflict choices are invalid." }, 422);
  }
  const resolutions: Partial<Record<RecipeConflictUnitKey, RecipeConflictChoice>> = {};
  for (const [key, value] of Object.entries(rawResolutions as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(key as RecipeConflictUnitKey) || (value !== "live" && value !== "proposed")) {
      return json({ ok: false, error: "Each conflict choice must select the live or proposed value." }, 422);
    }
    resolutions[key as RecipeConflictUnitKey] = value;
  }

  const allowed = await consumeRateLimit(request, "recipe-change-set-rebase", locals.user.id, 30, 24 * 60 * 60);
  if (!allowed) return json({ ok: false, error: "Private rebase limit reached." }, 429);

  try {
    const changeSet = await rebaseRecipeChangeSet({
      changeSetId,
      actor: { id: locals.user.id, role: locals.user.role },
      expectedRevision,
      resolutions,
    });
    return json({ ok: true, changeSet });
  } catch (error) {
    if (error instanceof RecipeSubmissionError) {
      const status = error.code === "invalid" ? 422 : error.code === "conflict" ? 409 : error.code === "forbidden" ? 403 : 503;
      return json({ ok: false, error: error.message }, status);
    }
    console.error("Recipe change-set rebase failed.", error);
    return json({ ok: false, error: "Private conflict resolution is temporarily unavailable." }, 503);
  }
};
