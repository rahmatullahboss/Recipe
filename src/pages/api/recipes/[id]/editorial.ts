import type { APIRoute } from "astro";
import { CSRF_COOKIE, isSameOriginRequest, validateCsrfToken } from "../../../../lib/auth";
import {
  RecipeSubmissionError,
  getRecipeSubmissionReadiness,
  transitionRecipeEditorialStatus,
  type EditorialAction,
} from "../../../../lib/recipe-submissions";
import { requestRecipeChanges } from "../../../../lib/recipe-revisions";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export const POST: APIRoute = async ({ request, cookies, locals, params }) => {
  if (!locals.authReady || !locals.user || !locals.session) {
    return json({ ok: false, error: "A verified editorial account is required." }, 401);
  }
  if (locals.user.role !== "editor" && locals.user.role !== "admin") {
    return json({ ok: false, error: "Editorial permission is required." }, 403);
  }
  if (!getRecipeSubmissionReadiness().ready) {
    return json({ ok: false, error: "Recipe editorial operations are not configured." }, 503);
  }
  if (!isSameOriginRequest(request)) return json({ ok: false, error: "Invalid editorial request origin." }, 403);

  let input: Record<string, unknown>;
  try {
    input = await request.json<Record<string, unknown>>();
  } catch {
    return json({ ok: false, error: "Editorial request JSON could not be read." }, 400);
  }

  const nonce = cookies.get(CSRF_COOKIE)?.value;
  const csrfValid = await validateCsrfToken("recipe-editorial", nonce, input.csrfToken);
  if (!csrfValid || input.sessionCsrf !== locals.session.csrfToken) {
    return json({ ok: false, error: "Editorial authorization expired." }, 403);
  }

  const action = input.action;
  if (action !== "publish" && action !== "archive" && action !== "request_changes") {
    return json({ ok: false, error: "Select a valid editorial action." }, 422);
  }
  const expectedRevision = Number(input.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    return json({ ok: false, error: "Editorial revision is invalid." }, 422);
  }
  const recipeId = params.id?.trim() ?? "";
  if (!/^recipe_[0-9a-f-]{36}$/i.test(recipeId)) return json({ ok: false, error: "Recipe identifier is invalid." }, 400);

  try {
    const reason = typeof input.reason === "string" ? input.reason : undefined;
    const result = action === "request_changes"
      ? await requestRecipeChanges({
        recipeId,
        actorId: locals.user.id,
        expectedRevision,
        reason,
      })
      : await transitionRecipeEditorialStatus({
        recipeId,
        actorId: locals.user.id,
        expectedRevision,
        action: action as EditorialAction,
        reason,
      });
    return json({ ok: true, result });
  } catch (error) {
    if (error instanceof RecipeSubmissionError) {
      const status = error.code === "invalid" ? 422 : error.code === "conflict" ? 409 : error.code === "forbidden" ? 403 : 503;
      return json({ ok: false, error: error.message }, status);
    }
    console.error("Recipe editorial transition failed.", error);
    return json({ ok: false, error: "Editorial transition is temporarily unavailable." }, 503);
  }
};
