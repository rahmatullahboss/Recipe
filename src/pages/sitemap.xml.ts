import type { APIRoute } from "astro";
import { listCategories, listRecipes } from "../lib/db";
import { markets } from "../lib/market";

function escapeXml(value: string): string {
  return value.replace(/[<>&'\"]/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

export const GET: APIRoute = async ({ request }) => {
  const origin = new URL(request.url).origin;
  const [recipes, categories] = await Promise.all([
    listRecipes({ country: "US", limit: 48 }),
    listCategories(100),
  ]);
  const paths = [
    "/",
    "/search",
    "/categories",
    "/markets",
    "/about",
    "/privacy",
    ...markets.map((market) => `/markets/${market.code.toLowerCase()}`),
    ...categories.map((category) => `/categories/${category.slug}`),
    ...recipes.map((recipe) => `/recipes/${recipe.slug}`),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
    .map((path) => `  <url><loc>${escapeXml(`${origin}${path}`)}</loc></url>`)
    .join("\n")}\n</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
};
