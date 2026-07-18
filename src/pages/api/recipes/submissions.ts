import type { APIRoute } from "astro";
import { CSRF_COOKIE, consumeRateLimit, isSameOriginRequest, validateCsrfToken } from "../../../lib/auth";
import { validateRecipeDraft } from "../../../lib/recipe-draft";
import {
  RecipeSubmissionError,
  getRecipeSubmissionReadiness,
  submitRecipeForReview,
} from "../../../lib/recipe-submissions";

const MAX_BODY_BYTES = 100_000;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.authReady || !locals.user || !locals.session) {
    return json({ ok: false, error: "A verified account is required." }, 401);
  }
  if (!getRecipeSubmissionReadiness().ready) return json({ ok: false, error: "Recipe submissions are not configured." }, 503);
  if (!isSameOriginRequest(request)) return json({ ok: false, error: "Invalid request origin." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return json({ ok: false, error: "Send application/json." }, 415);
  }
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "Request payload is too large." }, 413);
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json<Record<string, unknown>>();
  } catch {
    return json({ ok: false, error: "Request JSON could not be read." }, 400);
  }

  const nonce = cookies.get(CSRF_COOKIE)?.value;
  const csrfValid = await validateCsrfToken("recipe-submit", nonce, input.csrfToken);
  if (!csrfValid || input.sessionCsrf !== locals.session.csrfToken) {
    return json({ ok: false, error: "Request authorization expired." }, 403);
  }

  const allowed = await consumeRateLimit(request, "recipe-submit", locals.user.id, 10, 24 * 60 * 60);
  if (!allowed) return json({ ok: false, error: "Recipe submission limit reached." }, 429);

  const validation = validateRecipeDraft(input.draft);
  if (!validation.valid || !validation.draft) return json({ ok: false, errors: validation.errors }, 422);

  try {
    const submission = await submitRecipeForReview(locals.user.id, validation.draft);
    return json({ ok: true, submission, submissionsUrl: "/account/submissions" }, 201);
  } catch (error) {
    if (error instanceof RecipeSubmissionError) {
      const status = error.code === "invalid" ? 422 : error.code === "conflict" ? 409 : error.code === "forbidden" ? 403 : 503;
      return json({ ok: false, error: error.message }, status);
    }
    console.error("Recipe submission failed.", error);
    return json({ ok: false, error: "Recipe submission is temporarily unavailable." }, 503);
  }
};
