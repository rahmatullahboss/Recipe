import type { APIRoute } from "astro";
import { CSRF_COOKIE, consumeRateLimit, isSameOriginRequest, validateCsrfToken } from "../../../../lib/auth";
import {
  cancelPublishedRecipeChangeSet,
  savePublishedRecipeChangeSet,
  startPublishedRecipeChangeSet,
} from "../../../../lib/recipe-change-sets";
import { validateRecipeDraft } from "../../../../lib/recipe-draft";
import { getRecipeSubmissionReadiness, RecipeSubmissionError } from "../../../../lib/recipe-submissions";

const MAX_BODY_BYTES = 100_000;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export const POST: APIRoute = async ({ request, cookies, locals, params }) => {
  if (!locals.authReady || !locals.user || !locals.session) {
    return json({ ok: false, error: "A verified contributor account is required." }, 401);
  }
  if (!getRecipeSubmissionReadiness().ready) {
    return json({ ok: false, error: "Published recipe revisions are not configured." }, 503);
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
  const csrfValid = await validateCsrfToken("recipe-published-change-set", nonce, input.csrfToken);
  if (!csrfValid || input.sessionCsrf !== locals.session.csrfToken) {
    return json({ ok: false, error: "Request authorization expired." }, 403);
  }

  const action = input.action;
  if (action !== "create" && action !== "save" && action !== "submit" && action !== "cancel") {
    return json({ ok: false, error: "Select a valid change-set action." }, 422);
  }

  const limit = action === "save" ? 120 : 30;
  const allowed = await consumeRateLimit(request, "recipe-published-change-set", locals.user.id, limit, 24 * 60 * 60);
  if (!allowed) return json({ ok: false, error: "Published recipe revision limit reached." }, 429);

  try {
    if (action === "create") {
      const changeSet = await startPublishedRecipeChangeSet({ recipeId, userId: locals.user.id });
      return json({ ok: true, changeSet, editorUrl: `/account/submissions/${recipeId}/change-set` });
    }

    const changeSetId = typeof input.changeSetId === "string" ? input.changeSetId.trim() : "";
    if (!/^recipe_change_[0-9a-f-]{36}$/i.test(changeSetId)) {
      return json({ ok: false, error: "Change-set identifier is invalid." }, 400);
    }
    const expectedRevision = Number(input.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      return json({ ok: false, error: "Change-set revision is invalid." }, 422);
    }

    if (action === "cancel") {
      const changeSet = await cancelPublishedRecipeChangeSet({
        recipeId,
        changeSetId,
        userId: locals.user.id,
        expectedRevision,
        reason: typeof input.note === "string" ? input.note : undefined,
      });
      return json({ ok: true, changeSet, submissionsUrl: "/account/submissions" });
    }

    const validation = validateRecipeDraft(input.draft);
    if (!validation.valid || !validation.draft) {
      return json({ ok: false, errors: validation.errors }, 422);
    }
    const changeSet = await savePublishedRecipeChangeSet({
      recipeId,
      changeSetId,
      userId: locals.user.id,
      expectedRevision,
      draft: validation.draft,
      note: typeof input.note === "string" ? input.note : undefined,
      submit: action === "submit",
    });
    return json({ ok: true, changeSet, submissionsUrl: "/account/submissions" });
  } catch (error) {
    if (error instanceof RecipeSubmissionError) {
      const status = error.code === "invalid" ? 422 : error.code === "conflict" ? 409 : error.code === "forbidden" ? 403 : 503;
      return json({ ok: false, error: error.message }, status);
    }
    console.error("Published recipe change-set operation failed.", error);
    return json({ ok: false, error: "Published recipe revision is temporarily unavailable." }, 503);
  }
};
