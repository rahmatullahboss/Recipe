import type { APIRoute } from "astro";
import { listRecipes } from "../../lib/db";
import { resolveMarket } from "../../lib/market";

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() || undefined;
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "12", 10);
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 12;
  const market = resolveMarket(request, url);
  const recipes = await listRecipes({ search: query, country: market.code, limit });

  return Response.json(
    {
      data: recipes,
      meta: {
        query: query ?? null,
        market: { code: market.code, name: market.name },
        count: recipes.length,
      },
    },
    {
      headers: {
        "Cache-Control": "private, max-age=60",
        "Vary": "Cookie, CF-IPCountry",
      },
    },
  );
};
