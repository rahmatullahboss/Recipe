import type { APIRoute } from "astro";
import { CSRF_COOKIE, isSameOriginRequest, validateCsrfToken } from "../../../../lib/auth";
import {
  approvePublishedRecipeChangeSet,
  cancelPublishedRecipeChangeSetEditorial,
  requestPublishedRecipeChangeSetChanges,
} from "../../../../lib/recipe-change-sets";
import { getRecipeSubmissionReadiness, RecipeSubmissionError } from "../../../../lib/recipe-submissions";

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
    return json({ ok: false, error: "Published recipe change-set review is not configured." }, 503);
  }
  if (!isSameOriginRequest(request)) return json({ ok: false, error: "Invalid editorial request origin." }, 403);

  let input: Record<string, unknown>;
  try {
    input = await request.json<Record<string, unknown>>();
  } catch {
    return json({ ok: false, error: "Editorial request JSON could not be read." }, 400);
  }

  const nonce = cookies.get(CSRF_COOKIE)?.value;
  const csrfValid = await validateCsrfToken("recipe-change-set-editorial", nonce, input.csrfToken);
  if (!csrfValid || input.sessionCsrf !== locals.session.csrfToken) {
    return json({ ok: false, error: "Editorial authorization expired." }, 403);
  }

  const changeSetId = params.id?.trim() ?? "";
  if (!/^recipe_change_[0-9a-f-]{36}$/i.test(changeSetId)) {
    return json({ ok: false, error: "Change-set identifier is invalid." }, 400);
  }
  const expectedRevision = Number(input.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    return json({ ok: false, error: "Change-set revision is invalid." }, 422);
  }
  const action = input.action;
  if (action !== "request_changes" && action !== "approve" && action !== "cancel") {
    return json({ ok: false, error: "Select a valid editorial action." }, 422);
  }
  const reason = typeof input.reason === "string" ? input.reason : undefined;

  try {
    const changeSet = action === "request_changes"
      ? await requestPublishedRecipeChangeSetChanges({
        changeSetId,
        actorId: locals.user.id,
        expectedRevision,
        reason,
      })
      : action === "approve"
        ? await approvePublishedRecipeChangeSet({
          changeSetId,
          actorId: locals.user.id,
          expectedRevision,
          reason,
        })
        : await cancelPublishedRecipeChangeSetEditorial({
          changeSetId,
          actorId: locals.user.id,
          expectedRevision,
          reason,
        });
    return json({ ok: true, changeSet, queueUrl: "/admin/recipe-change-sets" });
  } catch (error) {
    if (error instanceof RecipeSubmissionError) {
      const status = error.code === "invalid" ? 422 : error.code === "conflict" ? 409 : error.code === "forbidden" ? 403 : 503;
      return json({ ok: false, error: error.message }, status);
    }
    console.error("Published recipe change-set editorial operation failed.", error);
    return json({ ok: false, error: "Published recipe change-set review is temporarily unavailable." }, 503);
  }
};
