import type { APIRoute } from "astro";
import { listRecipes } from "../../lib/db";

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() || undefined;
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "12", 10);
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 12;
  const recipes = await listRecipes({ search: query, limit });

  return Response.json(
    {
      data: recipes,
      meta: {
        query: query ?? null,
        count: recipes.length,
      },
    },
    {
      headers: {
        "Cache-Control": query
          ? "public, max-age=60, s-maxage=300"
          : "public, max-age=120, s-maxage=900",
      },
    },
  );
};
