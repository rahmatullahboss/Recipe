import { env } from "cloudflare:workers";
import { getAuthReadiness } from "./auth";
import { getMediaReadiness } from "./media";
import { getMediaRuntimeStatus } from "./media-runtime";
import type { RecipeDraft } from "./recipe-draft";

export type EditorialRecipeStatus = "draft" | "review" | "published" | "archived";
export type EditorialAction = "publish" | "archive";

export type RecipeSubmissionReadiness = {
  enabled: boolean;
  ready: boolean;
  database: boolean;
  authentication: boolean;
  mediaUploads: boolean;
  mediaStorage: boolean;
  missing: string[];
};

type SubmissionBindings = {
  DB?: D1Database;
  RECIPE_SUBMISSIONS_ENABLED?: string;
};

type CategoryRow = { id: string; slug: string };
type MediaRow = {
  id: string;
  owner_id: string;
  r2_key: string;
  upload_status: string;
  moderation_status: string;
  purpose: string;
};

type PublicationCheckRow = {
  id: string;
  status: EditorialRecipeStatus;
  revision: number;
  media_asset_id: string | null;
  media_status: string | null;
  ingredient_count: number;
  step_count: number;
  category_count: number;
};

const bindings = env as unknown as SubmissionBindings;

export class RecipeSubmissionError extends Error {
  constructor(
    public readonly code: "unavailable" | "invalid" | "conflict" | "forbidden",
    message: string,
  ) {
    super(message);
    this.name = "RecipeSubmissionError";
  }
}

function flag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function getDatabase(): D1Database | undefined {
  return bindings.DB;
}

export function getRecipeSubmissionReadiness(): RecipeSubmissionReadiness {
  const auth = getAuthReadiness();
  const media = getMediaReadiness();
  const mediaRuntime = getMediaRuntimeStatus();
  const state = {
    enabled: flag(bindings.RECIPE_SUBMISSIONS_ENABLED),
    database: Boolean(getDatabase()),
    authentication: auth.ready,
    mediaUploads: mediaRuntime.uploadsEnabled,
    mediaStorage: media.ready,
  };
  const missing: string[] = [];
  if (!state.enabled) missing.push("RECIPE_SUBMISSIONS_ENABLED=true");
  if (!state.database) missing.push("D1 recipe database");
  if (!state.authentication) missing.push("ready authentication");
  if (!state.mediaUploads) missing.push("enabled media uploads");
  if (!state.mediaStorage) missing.push("ready D1 and R2 media storage");
  return { ...state, ready: missing.length === 0, missing };
}

function slugBase(title: string): string {
  const value = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "");
  return value || "recipe";
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function resolveCategories(database: D1Database, slugs: string[]): Promise<CategoryRow[]> {
  const placeholders = slugs.map(() => "?").join(", ");
  const result = await database.prepare(
    `SELECT id, slug FROM categories WHERE slug IN (${placeholders})`,
  ).bind(...slugs).all<CategoryRow>();
  const categories = result.results ?? [];
  const found = new Set(categories.map((category) => category.slug));
  const missing = slugs.filter((slug) => !found.has(slug));
  if (missing.length) throw new RecipeSubmissionError("invalid", `Unknown categories: ${missing.join(", ")}.`);
  return categories;
}

async function resolveOwnedHeroMedia(database: D1Database, userId: string, mediaAssetId: string): Promise<MediaRow> {
  const media = await database.prepare(
    `SELECT m.id, m.owner_id, m.r2_key, m.upload_status, m.moderation_status, m.purpose
     FROM media_assets m
     WHERE m.id = ?
       AND m.owner_id = ?
       AND m.upload_status = 'uploaded'
       AND m.purpose = 'recipe_hero'
       AND m.moderation_status IN ('pending', 'approved')
       AND NOT EXISTS (SELECT 1 FROM recipes r WHERE r.media_asset_id = m.id)
     LIMIT 1`,
  ).bind(mediaAssetId, userId).first<MediaRow>();
  if (!media) {
    throw new RecipeSubmissionError(
      "invalid",
      "Attach an uploaded recipe image that you own and that is not rejected, quarantined, or already assigned.",
    );
  }
  return media;
}

function ingredientStatements(database: D1Database, recipeId: string, draft: RecipeDraft): D1PreparedStatement[] {
  return chunk(draft.ingredients, 12).map((group, groupIndex) => {
    const values = group.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
    const bindings: Array<string | number | null> = [];
    group.forEach((ingredient, index) => {
      const sortOrder = groupIndex * 12 + index + 1;
      bindings.push(
        `ingredient_${crypto.randomUUID()}`,
        recipeId,
        ingredient.item,
        ingredient.amount || null,
        ingredient.unit || null,
        ingredient.note || null,
        sortOrder,
      );
    });
    return database.prepare(
      `INSERT INTO recipe_ingredients (id, recipe_id, item, amount, unit, note, sort_order) VALUES ${values}`,
    ).bind(...bindings);
  });
}

function stepStatements(database: D1Database, recipeId: string, draft: RecipeDraft): D1PreparedStatement[] {
  return chunk(draft.steps, 15).map((group, groupIndex) => {
    const values = group.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
    const bindings: Array<string | number | null> = [];
    group.forEach((step, index) => {
      const sortOrder = groupIndex * 15 + index + 1;
      bindings.push(
        `step_${crypto.randomUUID()}`,
        recipeId,
        step.instruction,
        null,
        step.timerMinutes === null ? null : step.timerMinutes * 60,
        sortOrder,
      );
    });
    return database.prepare(
      `INSERT INTO recipe_steps (id, recipe_id, instruction, image_key, timer_seconds, sort_order) VALUES ${values}`,
    ).bind(...bindings);
  });
}

export async function submitRecipeForReview(userId: string, draft: RecipeDraft) {
  const readiness = getRecipeSubmissionReadiness();
  if (!readiness.ready) throw new RecipeSubmissionError("unavailable", "Recipe submissions are not ready.");
  if (!draft.mediaAssetId) throw new RecipeSubmissionError("invalid", "Upload and attach a recipe image before submitting.");

  const database = getDatabase()!;
  const categories = await resolveCategories(database, draft.categories);
  const media = await resolveOwnedHeroMedia(database, userId, draft.mediaAssetId);
  const recipeUuid = crypto.randomUUID();
  const recipeId = `recipe_${recipeUuid}`;
  const slug = `${slugBase(draft.title)}-${recipeUuid.replaceAll("-", "").slice(0, 10)}`;
  const imageUrl = `/media/${media.r2_key}`;

  const statements: D1PreparedStatement[] = [
    database.prepare(
      `INSERT INTO recipes (
        id, author_id, title, slug, summary, description, image_key, image_url,
        media_asset_id, country_code, language_code, measurement_system,
        prep_minutes, cook_minutes, servings, difficulty, status, revision,
        submitted_at, editorial_actor_id, editorial_reason, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'review', 1,
        CURRENT_TIMESTAMP, ?, 'Submitted for editorial review.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )`,
    ).bind(
      recipeId,
      userId,
      draft.title,
      slug,
      draft.summary,
      draft.description || null,
      media.r2_key,
      imageUrl,
      media.id,
      draft.countryCode,
      draft.languageCode,
      draft.measurementSystem,
      draft.prepMinutes,
      draft.cookMinutes,
      draft.servings,
      draft.difficulty,
      userId,
    ),
  ];

  if (categories.length) {
    const values = categories.map(() => "(?, ?)").join(", ");
    const categoryBindings = categories.flatMap((category) => [recipeId, category.id]);
    statements.push(
      database.prepare(`INSERT INTO recipe_categories (recipe_id, category_id) VALUES ${values}`).bind(...categoryBindings),
    );
  }
  statements.push(...ingredientStatements(database, recipeId, draft));
  statements.push(...stepStatements(database, recipeId, draft));

  const results = await database.batch(statements);
  if (!results.every((result) => result.success)) {
    throw new RecipeSubmissionError("unavailable", "The complete recipe submission could not be committed.");
  }

  return {
    id: recipeId,
    slug,
    status: "review" as const,
    revision: 1,
    mediaModerationStatus: media.moderation_status,
  };
}

export async function listContributorSubmissions(userId: string, limit = 50) {
  const database = getDatabase();
  if (!database) return [];
  const bounded = Math.min(Math.max(limit, 1), 100);
  const result = await database.prepare(
    `SELECT r.id, r.title, r.slug, r.status, r.revision, r.submitted_at, r.reviewed_at,
            r.editorial_reason, r.published_at, r.updated_at,
            m.moderation_status AS media_moderation_status
     FROM recipes r
     LEFT JOIN media_assets m ON m.id = r.media_asset_id
     WHERE r.author_id = ?
     ORDER BY COALESCE(r.submitted_at, r.created_at) DESC
     LIMIT ?`,
  ).bind(userId, bounded).all();
  return result.results ?? [];
}

export async function listEditorialQueue(limit = 100) {
  const database = getDatabase();
  if (!database) return [];
  const bounded = Math.min(Math.max(limit, 1), 100);
  const result = await database.prepare(
    `SELECT r.id, r.title, r.slug, r.summary, r.country_code, r.language_code,
            r.prep_minutes, r.cook_minutes, r.servings, r.difficulty,
            r.status, r.revision, r.submitted_at,
            u.display_name AS author_name, u.email AS author_email,
            m.r2_key, m.alt_text, m.moderation_status AS media_moderation_status,
            (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.recipe_id = r.id) AS ingredient_count,
            (SELECT COUNT(*) FROM recipe_steps rs WHERE rs.recipe_id = r.id) AS step_count,
            (SELECT COUNT(*) FROM recipe_categories rc WHERE rc.recipe_id = r.id) AS category_count
     FROM recipes r
     JOIN users u ON u.id = r.author_id
     LEFT JOIN media_assets m ON m.id = r.media_asset_id
     WHERE r.status = 'review'
     ORDER BY r.submitted_at ASC, r.created_at ASC
     LIMIT ?`,
  ).bind(bounded).all();
  return result.results ?? [];
}

export async function getEditorialRecipe(recipeId: string) {
  const database = getDatabase();
  if (!database) return null;
  const recipe = await database.prepare(
    `SELECT r.*, u.display_name AS author_name, u.email AS author_email,
            m.r2_key, m.alt_text, m.moderation_status AS media_moderation_status,
            m.upload_status AS media_upload_status
     FROM recipes r
     JOIN users u ON u.id = r.author_id
     LEFT JOIN media_assets m ON m.id = r.media_asset_id
     WHERE r.id = ?
     LIMIT 1`,
  ).bind(recipeId).first();
  if (!recipe) return null;
  const [ingredients, steps, categories, events] = await Promise.all([
    database.prepare(
      "SELECT item, amount, unit, note, sort_order FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order ASC",
    ).bind(recipeId).all(),
    database.prepare(
      "SELECT instruction, timer_seconds, sort_order FROM recipe_steps WHERE recipe_id = ? ORDER BY sort_order ASC",
    ).bind(recipeId).all(),
    database.prepare(
      `SELECT c.name, c.slug, c.type
       FROM categories c JOIN recipe_categories rc ON rc.category_id = c.id
       WHERE rc.recipe_id = ? ORDER BY c.sort_order ASC, c.name ASC`,
    ).bind(recipeId).all(),
    database.prepare(
      `SELECT e.previous_status, e.next_status, e.reason, e.revision, e.created_at,
              u.display_name AS actor_name
       FROM recipe_editorial_events e JOIN users u ON u.id = e.actor_id
       WHERE e.recipe_id = ? ORDER BY e.created_at DESC`,
    ).bind(recipeId).all(),
  ]);
  return {
    recipe,
    ingredients: ingredients.results ?? [],
    steps: steps.results ?? [],
    categories: categories.results ?? [],
    events: events.results ?? [],
  };
}

async function publicationCheck(database: D1Database, recipeId: string): Promise<PublicationCheckRow | null> {
  return database.prepare(
    `SELECT r.id, r.status, r.revision, r.media_asset_id,
            m.moderation_status AS media_status,
            (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.recipe_id = r.id) AS ingredient_count,
            (SELECT COUNT(*) FROM recipe_steps rs WHERE rs.recipe_id = r.id) AS step_count,
            (SELECT COUNT(*) FROM recipe_categories rc WHERE rc.recipe_id = r.id) AS category_count
     FROM recipes r
     LEFT JOIN media_assets m ON m.id = r.media_asset_id AND m.upload_status = 'uploaded'
     WHERE r.id = ? LIMIT 1`,
  ).bind(recipeId).first<PublicationCheckRow>();
}

export async function transitionRecipeEditorialStatus(input: {
  recipeId: string;
  actorId: string;
  expectedRevision: number;
  action: EditorialAction;
  reason?: string;
}) {
  const readiness = getRecipeSubmissionReadiness();
  if (!readiness.ready) throw new RecipeSubmissionError("unavailable", "Recipe editorial operations are not ready.");
  const database = getDatabase()!;
  const current = await publicationCheck(database, input.recipeId);
  if (!current) throw new RecipeSubmissionError("invalid", "Recipe submission was not found.");
  if (current.status !== "review") throw new RecipeSubmissionError("conflict", "This recipe is no longer awaiting review.");
  if (current.revision !== input.expectedRevision) throw new RecipeSubmissionError("conflict", "This recipe changed after the page was loaded.");

  const reason = input.reason?.trim().replace(/\s+/g, " ").slice(0, 1000) || null;
  if (input.action === "archive" && (!reason || reason.length < 5)) {
    throw new RecipeSubmissionError("invalid", "Add a clear editorial reason before archiving the submission.");
  }
  if (input.action === "publish") {
    if (!current.media_asset_id || current.media_status !== "approved") {
      throw new RecipeSubmissionError("invalid", "Approve the attached hero image before publishing this recipe.");
    }
    if (current.ingredient_count < 2 || current.step_count < 2 || current.category_count < 1) {
      throw new RecipeSubmissionError("invalid", "Recipe content is incomplete and cannot be published.");
    }
  }

  const nextStatus: EditorialRecipeStatus = input.action === "publish" ? "published" : "archived";
  const result = await database.prepare(
    `UPDATE recipes
     SET status = ?,
         revision = revision + 1,
         editorial_actor_id = ?,
         editorial_reason = ?,
         reviewed_at = CURRENT_TIMESTAMP,
         published_at = CASE WHEN ? = 'published' THEN CURRENT_TIMESTAMP ELSE published_at END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND status = 'review'
       AND revision = ?
       AND (
         ? != 'published'
         OR EXISTS (
           SELECT 1
           FROM media_assets m
           WHERE m.id = recipes.media_asset_id
             AND m.upload_status = 'uploaded'
             AND m.moderation_status = 'approved'
         )
       )`,
  ).bind(
    nextStatus,
    input.actorId,
    reason,
    nextStatus,
    input.recipeId,
    input.expectedRevision,
    nextStatus,
  ).run();

  if (!result.success || (result.meta.changes ?? 0) !== 1) {
    throw new RecipeSubmissionError("conflict", "The submission or attached media changed concurrently. Reload the review page.");
  }
  return { id: input.recipeId, status: nextStatus, revision: input.expectedRevision + 1 };
}
