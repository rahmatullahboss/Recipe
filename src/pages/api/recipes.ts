import type { APIRoute } from "astro";
import {
  listRecipes,
  type RecipeDifficulty,
  type RecipeSort,
} from "../../lib/db";
import { resolveMarket } from "../../lib/market";

const difficulties = new Set<RecipeDifficulty>(["easy", "medium", "hard"]);
const sorts = new Set<RecipeSort>(["recommended", "rating", "quickest", "popular"]);

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() || undefined;
  const category = url.searchParams.get("category")?.trim().toLowerCase() || undefined;
  const requestedDifficulty = url.searchParams.get("difficulty")?.trim().toLowerCase() as RecipeDifficulty | undefined;
  const difficulty = requestedDifficulty && difficulties.has(requestedDifficulty)
    ? requestedDifficulty
    : undefined;
  const requestedSort = url.searchParams.get("sort")?.trim().toLowerCase() as RecipeSort | undefined;
  const sort = requestedSort && sorts.has(requestedSort) ? requestedSort : "recommended";
  const requestedMaxTime = Number.parseInt(url.searchParams.get("maxTime") ?? "", 10);
  const maxTotalMinutes = Number.isFinite(requestedMaxTime) && requestedMaxTime > 0
    ? requestedMaxTime
    : undefined;
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "12", 10);
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 12;
  const market = resolveMarket(request, url);
  const recipes = await listRecipes({
    search: query,
    category,
    difficulty,
    maxTotalMinutes,
    sort,
    country: market.code,
    limit,
  });

  return Response.json(
    {
      data: recipes,
      meta: {
        query: query ?? null,
        category: category ?? null,
        difficulty: difficulty ?? null,
        maxTotalMinutes: maxTotalMinutes ?? null,
        sort,
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
