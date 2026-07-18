import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  return Response.json(
    {
      id: "/",
      name: "Ozzyl Recipes",
      short_name: "Ozzyl Recipes",
      description: "International recipes, meal planning, shopping lists, and guided cooking tools.",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#fffdf8",
      theme_color: "#fffdf8",
      categories: ["food", "lifestyle"],
      icons: [
        {
          src: "/icons/ozzyl-recipes.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any maskable",
        },
      ],
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        "Content-Type": "application/manifest+json; charset=utf-8",
      },
    },
  );
};
