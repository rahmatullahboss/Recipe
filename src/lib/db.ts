import { env } from "cloudflare:workers";
import { fallbackCategories, fallbackRecipes } from "../data/fallback-recipes";

export type RecipeSummary = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  image_url: string | null;
  prep_minutes: number;
  cook_minutes: number;
  servings: number;
  difficulty: "easy" | "medium" | "hard";
  average_rating: number;
  rating_count: number;
  save_count: number;
  view_count: number;
  is_featured: number;
  author_name: string;
  country_code: string;
};

export type RecipeIngredient = {
  id: string;
  item: string;
  amount: string | null;
  unit: string | null;
  note: string | null;
  sort_order: number;
};

export type RecipeStep = {
  id: string;
  instruction: string;
  image_key: string | null;
  timer_seconds: number | null;
  sort_order: number;
};

export type RecipeDetail = RecipeSummary & {
  description: string | null;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  categories: Array<{ name: string; slug: string; type: string }>;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  type: string;
};

type OptionalBindings = { DB?: D1Database };

type RecipeListOptions = {
  search?: string;
  featured?: boolean;
  limit?: number;
  country?: string;
};

function getDatabase(): D1Database | undefined {
  return (env as unknown as OptionalBindings).DB;
}

export function hasDatabase(): boolean {
  return Boolean(getDatabase());
}

function listFallbackRecipes(options: RecipeListOptions = {}): RecipeSummary[] {
  const search = options.search?.trim().toLowerCase();
  const country = options.country?.trim().toUpperCase() || "US";
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 48);

  return fallbackRecipes
    .filter((recipe) => !options.featured || recipe.is_featured === 1)
    .filter((recipe) => {
      if (!search) return true;
      const categoryText = recipe.categories.map((category) => category.name).join(" ");
      return `${recipe.title} ${recipe.summary} ${recipe.description ?? ""} ${categoryText}`
        .toLowerCase()
        .includes(search);
    })
    .sort((a, b) => {
      const aRank = a.country_code === country ? 0 : a.country_code === "GLOBAL" ? 1 : 2;
      const bRank = b.country_code === country ? 0 : b.country_code === "GLOBAL" ? 1 : 2;
      return aRank - bRank || b.is_featured - a.is_featured || b.average_rating - a.average_rating;
    })
    .slice(0, limit)
    .map(({ description: _description, ingredients: _ingredients, steps: _steps, categories: _categories, ...recipe }) => recipe);
}

function getFallbackRecipeBySlug(slug: string): RecipeDetail | null {
  return fallbackRecipes.find((recipe) => recipe.slug === slug) ?? null;
}

const summarySelect = `
  SELECT
    r.id,
    r.title,
    r.slug,
    r.summary,
    r.description,
    r.image_url,
    r.prep_minutes,
    r.cook_minutes,
    r.servings,
    r.difficulty,
    r.average_rating,
    r.rating_count,
    r.save_count,
    r.view_count,
    r.is_featured,
    r.country_code,
    u.display_name AS author_name
  FROM recipes r
  JOIN users u ON u.id = r.author_id
`;

export async function listRecipes(options: RecipeListOptions = {}): Promise<RecipeSummary[]> {
  const database = getDatabase();
  if (!database) return listFallbackRecipes(options);

  const search = options.search?.trim();
  const country = options.country?.trim().toUpperCase() || "US";
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 48);
  const conditions = ["r.status = 'published'"];
  const bindings: Array<string | number> = [];

  if (options.featured) conditions.push("r.is_featured = 1");

  if (search) {
    conditions.push("(r.title LIKE ? OR r.summary LIKE ? OR r.description LIKE ?)");
    const term = `%${search}%`;
    bindings.push(term, term, term);
  }

  bindings.push(country, limit);

  const query = `${summarySelect}
    WHERE ${conditions.join(" AND ")}
    ORDER BY
      CASE WHEN r.country_code = ? THEN 0 WHEN r.country_code = 'GLOBAL' THEN 1 ELSE 2 END,
      r.is_featured DESC,
      r.published_at DESC,
      r.created_at DESC
    LIMIT ?`;

  try {
    const result = await database.prepare(query).bind(...bindings).all<RecipeSummary>();
    return result.results ?? [];
  } catch (error) {
    console.error("D1 recipe query failed; serving the static fallback catalogue.", error);
    return listFallbackRecipes(options);
  }
}

export async function listCategories(limit = 12): Promise<Category[]> {
  const boundedLimit = Math.min(Math.max(limit, 1), 30);
  const database = getDatabase();
  if (!database) return fallbackCategories.slice(0, boundedLimit);

  try {
    const result = await database
      .prepare(
        `SELECT id, name, slug, type
         FROM categories
         ORDER BY sort_order ASC, name ASC
         LIMIT ?`,
      )
      .bind(boundedLimit)
      .all<Category>();

    return result.results ?? [];
  } catch (error) {
    console.error("D1 category query failed; serving fallback categories.", error);
    return fallbackCategories.slice(0, boundedLimit);
  }
}

export async function getRecipeBySlug(slug: string): Promise<RecipeDetail | null> {
  const database = getDatabase();
  if (!database) return getFallbackRecipeBySlug(slug);

  try {
    const recipe = await database
      .prepare(
        `${summarySelect}
         WHERE r.slug = ? AND r.status = 'published'
         LIMIT 1`,
      )
      .bind(slug)
      .first<RecipeSummary & { description: string | null }>();

    if (!recipe) return getFallbackRecipeBySlug(slug);

    const [ingredientsResult, stepsResult, categoriesResult] = await Promise.all([
      database
        .prepare(
          `SELECT id, item, amount, unit, note, sort_order
           FROM recipe_ingredients
           WHERE recipe_id = ?
           ORDER BY sort_order ASC`,
        )
        .bind(recipe.id)
        .all<RecipeIngredient>(),
      database
        .prepare(
          `SELECT id, instruction, image_key, timer_seconds, sort_order
           FROM recipe_steps
           WHERE recipe_id = ?
           ORDER BY sort_order ASC`,
        )
        .bind(recipe.id)
        .all<RecipeStep>(),
      database
        .prepare(
          `SELECT c.name, c.slug, c.type
           FROM categories c
           JOIN recipe_categories rc ON rc.category_id = c.id
           WHERE rc.recipe_id = ?
           ORDER BY c.sort_order ASC, c.name ASC`,
        )
        .bind(recipe.id)
        .all<{ name: string; slug: string; type: string }>(),
    ]);

    return {
      ...recipe,
      ingredients: ingredientsResult.results ?? [],
      steps: stepsResult.results ?? [],
      categories: categoriesResult.results ?? [],
    };
  } catch (error) {
    console.error("D1 recipe detail query failed; serving the static fallback recipe.", error);
    return getFallbackRecipeBySlug(slug);
  }
}
