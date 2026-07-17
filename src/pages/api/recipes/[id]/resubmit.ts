import type { APIRoute } from "astro";
import { CSRF_COOKIE, consumeRateLimit, isSameOriginRequest, validateCsrfToken } from "../../../../lib/auth";
import { validateRecipeDraft } from "../../../../lib/recipe-draft";
import { RecipeSubmissionError, getRecipeSubmissionReadiness } from "../../../../lib/recipe-submissions";
import { resubmitRecipeRevision } from "../../../../lib/recipe-revisions";

const MAX_BODY_BYTES = 100_000;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export const POST: APIRoute = async ({ request, cookies, locals, params }) => {
  if (!locals.authReady || !locals.user || !locals.session) {
    return json({ ok: false, error: "A verified contributor account is required." }, 401);
  }
  if (!getRecipeSubmissionReadiness().ready) {
    return json({ ok: false, error: "Recipe revisions are not configured." }, 503);
  }
  if (!isSameOriginRequest(request)) return json({ ok: false, error: "Invalid request origin." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return json({ ok: false, error: "Send application/json." }, 415);
  }
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "Request payload is too large." }, 413);
  }

  const recipeId = params.id?.trim() ?? "";
  if (!/^recipe_[0-9a-f-]{36}$/i.test(recipeId)) {
    return json({ ok: false, error: "Recipe identifier is invalid." }, 400);
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json<Record<string, unknown>>();
  } catch {
    return json({ ok: false, error: "Request JSON could not be read." }, 400);
  }

  const nonce = cookies.get(CSRF_COOKIE)?.value;
  const csrfValid = await validateCsrfToken("recipe-resubmit", nonce, input.csrfToken);
  if (!csrfValid || input.sessionCsrf !== locals.session.csrfToken) {
    return json({ ok: false, error: "Request authorization expired." }, 403);
  }

  const expectedRevision = Number(input.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    return json({ ok: false, error: "Recipe revision is invalid." }, 422);
  }

  const allowed = await consumeRateLimit(request, "recipe-resubmit", locals.user.id, 20, 24 * 60 * 60);
  if (!allowed) return json({ ok: false, error: "Recipe revision limit reached." }, 429);

  const validation = validateRecipeDraft(input.draft);
  if (!validation.valid || !validation.draft) {
    return json({ ok: false, errors: validation.errors }, 422);
  }

  try {
    const revision = await resubmitRecipeRevision({
      recipeId,
      userId: locals.user.id,
      expectedRevision,
      draft: validation.draft,
      note: typeof input.note === "string" ? input.note : undefined,
    });
    return json({ ok: true, revision, submissionsUrl: "/account/submissions" });
  } catch (error) {
    if (error instanceof RecipeSubmissionError) {
      const status = error.code === "invalid" ? 422 : error.code === "conflict" ? 409 : error.code === "forbidden" ? 403 : 503;
      return json({ ok: false, error: error.message }, status);
    }
    console.error("Recipe resubmission failed.", error);
    return json({ ok: false, error: "Recipe resubmission is temporarily unavailable." }, 503);
  }
};
