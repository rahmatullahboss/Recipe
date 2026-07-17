import type { APIRoute } from "astro";
import { CSRF_COOKIE, isSameOriginRequest, validateCsrfToken } from "../../../../../lib/auth";
import {
  processDueScheduledPublications,
} from "../../../../../lib/recipe-publication";
import {
  RecipeSubmissionError,
  getRecipeSubmissionReadiness,
} from "../../../../../lib/recipe-submissions";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.authReady || !locals.user || !locals.session) {
    return json({ ok: false, error: "A verified editorial account is required." }, 401);
  }
  if (locals.user.role !== "editor" && locals.user.role !== "admin") {
    return json({ ok: false, error: "Editorial permission is required." }, 403);
  }
  if (!getRecipeSubmissionReadiness().ready) {
    return json({ ok: false, error: "Scheduled publication processing is not configured." }, 503);
  }
  if (!isSameOriginRequest(request)) {
    return json({ ok: false, error: "Invalid scheduled-publication request origin." }, 403);
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json<Record<string, unknown>>();
  } catch {
    return json({ ok: false, error: "Scheduled-publication request JSON could not be read." }, 400);
  }

  const nonce = cookies.get(CSRF_COOKIE)?.value;
  const csrfValid = await validateCsrfToken("recipe-schedule-process", nonce, input.csrfToken);
  if (!csrfValid || input.sessionCsrf !== locals.session.csrfToken) {
    return json({ ok: false, error: "Scheduled-publication authorization expired." }, 403);
  }

  const requestedLimit = Number(input.limit ?? 10);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 25) {
    return json({ ok: false, error: "Processor limit must be between 1 and 25." }, 422);
  }

  try {
    const result = await processDueScheduledPublications({
      actorId: locals.user.id,
      limit: requestedLimit,
    });
    return json({ ok: true, result });
  } catch (error) {
    if (error instanceof RecipeSubmissionError) {
      const status = error.code === "invalid" ? 422 : error.code === "conflict" ? 409 : error.code === "forbidden" ? 403 : 503;
      return json({ ok: false, error: error.message }, status);
    }
    console.error("Scheduled recipe publication processing failed.", error);
    return json({ ok: false, error: "Scheduled publication processing is temporarily unavailable." }, 503);
  }
};
