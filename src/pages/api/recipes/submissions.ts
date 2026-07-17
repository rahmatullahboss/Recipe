import type { APIRoute } from "astro";
import { getRecipeSubmissionReadiness } from "../../../lib/recipe-submissions";

export const POST: APIRoute = async () => {
  const readiness = getRecipeSubmissionReadiness();
  return Response.json(
    { ok: false, error: readiness.ready ? "Recipe submission validation is pending." : "Recipe submissions are not configured." },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
};
