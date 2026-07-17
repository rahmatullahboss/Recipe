import { env } from "cloudflare:workers";

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
    u.display_name AS author_name
  FROM recipes r
  JOIN users u ON u.id = r.author_id
`;

export async function listRecipes(options: {
  search?: string;
  featured?: boolean;
  limit?: number;
} = {}): Promise<RecipeSummary[]> {
  const search = options.search?.trim();
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 48);
  const conditions = ["r.status = 'published'"];
  const bindings: Array<string | number> = [];

  if (options.featured) {
    conditions.push("r.is_featured = 1");
  }

  if (search) {
    conditions.push("(r.title LIKE ? OR r.summary LIKE ? OR r.description LIKE ?)");
    const term = `%${search}%`;
    bindings.push(term, term, term);
  }

  bindings.push(limit);

  const query = `${summarySelect}
    WHERE ${conditions.join(" AND ")}
    ORDER BY r.is_featured DESC, r.published_at DESC, r.created_at DESC
    LIMIT ?`;

  const result = await env.DB.prepare(query).bind(...bindings).all<RecipeSummary>();
  return result.results ?? [];
}

export async function listCategories(limit = 12): Promise<Category[]> {
  const result = await env.DB.prepare(
    `SELECT id, name, slug, type
     FROM categories
     ORDER BY sort_order ASC, name ASC
     LIMIT ?`,
  )
    .bind(Math.min(Math.max(limit, 1), 30))
    .all<Category>();

  return result.results ?? [];
}

export async function getRecipeBySlug(slug: string): Promise<RecipeDetail | null> {
  const recipe = await env.DB.prepare(
    `${summarySelect}
      WHERE r.slug = ? AND r.status = 'published'
      LIMIT 1`,
  )
    .bind(slug)
    .first<RecipeSummary & { description: string | null }>();

  if (!recipe) return null;

  const [ingredientsResult, stepsResult, categoriesResult] = await Promise.all([
    env.DB.prepare(
      `SELECT id, item, amount, unit, note, sort_order
       FROM recipe_ingredients
       WHERE recipe_id = ?
       ORDER BY sort_order ASC`,
    )
      .bind(recipe.id)
      .all<RecipeIngredient>(),
    env.DB.prepare(
      `SELECT id, instruction, image_key, timer_seconds, sort_order
       FROM recipe_steps
       WHERE recipe_id = ?
       ORDER BY sort_order ASC`,
    )
      .bind(recipe.id)
      .all<RecipeStep>(),
    env.DB.prepare(
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
}
