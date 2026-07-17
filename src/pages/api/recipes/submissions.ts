import type { APIRoute } from "astro";
import { getRecipeSubmissionReadiness } from "../../../lib/recipe-submissions";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export const POST: APIRoute = async ({ locals }) => {
  if (!locals.authReady || !locals.user || !locals.session) {
    return json({ ok: false, error: "A verified account is required." }, 401);
  }
  const readiness = getRecipeSubmissionReadiness();
  if (!readiness.ready) return json({ ok: false, error: "Recipe submissions are not configured." }, 503);
  return json({ ok: false, error: "Recipe submission validation is pending." }, 503);
};
