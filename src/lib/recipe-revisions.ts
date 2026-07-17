import { env } from "cloudflare:workers";
import type { RecipeDraft } from "./recipe-draft";
import { getRecipeSubmissionReadiness, RecipeSubmissionError } from "./recipe-submissions";

type RevisionBindings = { DB?: D1Database };
type CategoryRow = { id: string; slug: string };
type MediaRow = {
  id: string;
  owner_id: string;
  r2_key: string;
  moderation_status: string;
};

type EditableRecipeRow = {
  id: string;
  author_id: string;
  title: string;
  summary: string;
  description: string | null;
  media_asset_id: string | null;
  country_code: string;
  language_code: string;
  measurement_system: "us" | "metric";
  prep_minutes: number;
  cook_minutes: number;
  servings: number;
  difficulty: "easy" | "medium" | "hard";
  status: "draft" | "review" | "published" | "archived";
  revision: number;
  content_revision: number;
  editorial_reason: string | null;
  change_requested_at: string | null;
  media_upload_status: string | null;
  media_moderation_status: string | null;
  media_r2_key: string | null;
  media_alt_text: string | null;
};

type IngredientRow = {
  item: string;
  amount: string | null;
  unit: string | null;
  note: string | null;
};

type StepRow = {
  instruction: string;
  timer_seconds: number | null;
};

type CategorySlugRow = { slug: string };

const bindings = env as unknown as RevisionBindings;

function getDatabase(): D1Database | undefined {
  return bindings.DB;
}

function cleanNote(value: string | undefined): string | null {
  const note = value?.trim().replace(/\s+/g, " ").slice(0, 1000) ?? "";
  return note || null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
}

async function resolveCategories(database: D1Database, slugs: string[]): Promise<CategoryRow[]> {
  const placeholders = slugs.map(() => "?").join(", ");
  const result = await database
    .prepare(`SELECT id, slug FROM categories WHERE slug IN (${placeholders})`)
    .bind(...slugs)
    .all<CategoryRow>();
  const categories = result.results ?? [];
  const found = new Set(categories.map((category) => category.slug));
  const missing = slugs.filter((slug) => !found.has(slug));
  if (missing.length) throw new RecipeSubmissionError("invalid", `Unknown categories: ${missing.join(", ")}.`);
  return categories;
}

async function resolveOwnedHeroMedia(
  database: D1Database,
  userId: string,
  mediaAssetId: string,
  recipeId: string,
): Promise<MediaRow> {
  const media = await database.prepare(
    `SELECT m.id, m.owner_id, m.r2_key, m.moderation_status
     FROM media_assets m
     WHERE m.id = ?
       AND m.owner_id = ?
       AND m.upload_status = 'uploaded'
       AND m.purpose = 'recipe_hero'
       AND m.moderation_status IN ('pending', 'approved')
       AND NOT EXISTS (
         SELECT 1 FROM recipes assigned
         WHERE assigned.media_asset_id = m.id AND assigned.id <> ?
       )
     LIMIT 1`,
  ).bind(mediaAssetId, userId, recipeId).first<MediaRow>();

  if (!media) {
    throw new RecipeSubmissionError(
      "invalid",
      "Attach an uploaded recipe image that you own and that is not rejected, quarantined, or assigned to another recipe.",
    );
  }
  return media;
}

async function loadRecipeContent(database: D1Database, recipeId: string) {
  const [ingredientsResult, stepsResult, categoriesResult] = await Promise.all([
    database.prepare(
      `SELECT item, amount, unit, note
       FROM recipe_ingredients
       WHERE recipe_id = ?
       ORDER BY sort_order ASC`,
    ).bind(recipeId).all<IngredientRow>(),
    database.prepare(
      `SELECT instruction, timer_seconds
       FROM recipe_steps
       WHERE recipe_id = ?
       ORDER BY sort_order ASC`,
    ).bind(recipeId).all<StepRow>(),
    database.prepare(
      `SELECT c.slug
       FROM categories c
       JOIN recipe_categories rc ON rc.category_id = c.id
       WHERE rc.recipe_id = ?
       ORDER BY c.sort_order ASC, c.name ASC`,
    ).bind(recipeId).all<CategorySlugRow>(),
  ]);

  return {
    ingredients: ingredientsResult.results ?? [],
    steps: stepsResult.results ?? [],
    categories: categoriesResult.results ?? [],
  };
}

function toDraft(recipe: EditableRecipeRow, content: Awaited<ReturnType<typeof loadRecipeContent>>, mediaAssetId: string | null): RecipeDraft {
  return {
    title: recipe.title,
    summary: recipe.summary,
    description: recipe.description ?? "",
    mediaAssetId,
    countryCode: recipe.country_code,
    languageCode: recipe.language_code as RecipeDraft["languageCode"],
    measurementSystem: recipe.measurement_system,
    prepMinutes: recipe.prep_minutes,
    cookMinutes: recipe.cook_minutes,
    servings: recipe.servings,
    difficulty: recipe.difficulty,
    categories: content.categories.map((category) => category.slug),
    ingredients: content.ingredients.map((ingredient) => ({
      item: ingredient.item,
      amount: ingredient.amount ?? "",
      unit: ingredient.unit ?? "",
      note: ingredient.note ?? "",
    })),
    steps: content.steps.map((step) => ({
      instruction: step.instruction,
      timerMinutes: step.timer_seconds === null ? null : Math.round(step.timer_seconds / 60),
    })),
  };
}

async function findEditableRecipe(database: D1Database, userId: string, recipeId: string): Promise<EditableRecipeRow | null> {
  return database.prepare(
    `SELECT r.id, r.author_id, r.title, r.summary, r.description, r.media_asset_id,
            r.country_code, r.language_code, r.measurement_system, r.prep_minutes,
            r.cook_minutes, r.servings, r.difficulty, r.status, r.revision,
            r.content_revision, r.editorial_reason, r.change_requested_at,
            m.upload_status AS media_upload_status,
            m.moderation_status AS media_moderation_status,
            m.r2_key AS media_r2_key,
            m.alt_text AS media_alt_text
     FROM recipes r
     LEFT JOIN media_assets m ON m.id = r.media_asset_id
     WHERE r.id = ? AND r.author_id = ? AND r.status = 'draft'
     LIMIT 1`,
  ).bind(recipeId, userId).first<EditableRecipeRow>();
}

export async function getContributorEditableSubmission(userId: string, recipeId: string) {
  const database = getDatabase();
  if (!database) return null;
  const recipe = await findEditableRecipe(database, userId, recipeId);
  if (!recipe) return null;
  const [content, snapshotsResult] = await Promise.all([
    loadRecipeContent(database, recipeId),
    database.prepare(
      `SELECT content_revision, source, created_at
       FROM recipe_revision_snapshots
       WHERE recipe_id = ? AND author_id = ?
       ORDER BY content_revision DESC
       LIMIT 20`,
    ).bind(recipeId, userId).all(),
  ]);

  const reusableMedia = recipe.media_asset_id
    && recipe.media_upload_status === "uploaded"
    && (recipe.media_moderation_status === "pending" || recipe.media_moderation_status === "approved")
    ? recipe.media_asset_id
    : null;

  return {
    recipeId: recipe.id,
    revision: recipe.revision,
    contentRevision: recipe.content_revision,
    changeReason: recipe.editorial_reason,
    changeRequestedAt: recipe.change_requested_at,
    draft: toDraft(recipe, content, reusableMedia),
    media: reusableMedia && recipe.media_r2_key ? {
      id: reusableMedia,
      altText: recipe.media_alt_text,
      moderationStatus: recipe.media_moderation_status,
      previewUrl: `/media/${recipe.media_r2_key}?preview=1`,
    } : null,
    mediaReplacementRequired: Boolean(recipe.media_asset_id && !reusableMedia),
    snapshots: snapshotsResult.results ?? [],
  };
}

export async function listContributorSubmissionsWithRevisions(userId: string, limit = 100) {
  const database = getDatabase();
  if (!database) return [];
  const bounded = Math.min(Math.max(limit, 1), 100);
  const result = await database.prepare(
    `SELECT r.id, r.title, r.slug, r.status, r.revision, r.content_revision,
            r.submitted_at, r.resubmitted_at, r.reviewed_at, r.change_requested_at,
            r.editorial_reason, r.published_at, r.updated_at,
            m.moderation_status AS media_moderation_status
     FROM recipes r
     LEFT JOIN media_assets m ON m.id = r.media_asset_id
     WHERE r.author_id = ?
     ORDER BY COALESCE(r.resubmitted_at, r.submitted_at, r.created_at) DESC
     LIMIT ?`,
  ).bind(userId, bounded).all();
  return result.results ?? [];
}

export async function requestRecipeChanges(input: {
  recipeId: string;
  actorId: string;
  expectedRevision: number;
  reason?: string;
}) {
  const readiness = getRecipeSubmissionReadiness();
  if (!readiness.ready) throw new RecipeSubmissionError("unavailable", "Recipe editorial operations are not ready.");
  const reason = cleanNote(input.reason);
  if (!reason || reason.length < 10) {
    throw new RecipeSubmissionError("invalid", "Describe the required changes with at least 10 characters.");
  }

  const database = getDatabase()!;
  const result = await database.prepare(
    `UPDATE recipes
     SET status = 'draft',
         revision = revision + 1,
         editorial_actor_id = ?,
         editorial_reason = ?,
         reviewed_at = CURRENT_TIMESTAMP,
         change_requested_at = CURRENT_TIMESTAMP,
         revision_write_token = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'review' AND revision = ?`,
  ).bind(input.actorId, reason, input.recipeId, input.expectedRevision).run();

  if (!result.success || (result.meta.changes ?? 0) !== 1) {
    throw new RecipeSubmissionError("conflict", "The submission changed concurrently. Reload the review page.");
  }
  return { id: input.recipeId, status: "draft" as const, revision: input.expectedRevision + 1 };
}

function guardedCategoryStatements(
  database: D1Database,
  recipeId: string,
  writeToken: string,
  categories: CategoryRow[],
): D1PreparedStatement[] {
  return chunk(categories, 20).map((group) => {
    const selects = group.map(() => "SELECT ?, ? FROM recipes WHERE id = ? AND revision_write_token = ?").join(" UNION ALL ");
    const values = group.flatMap((category) => [recipeId, category.id, recipeId, writeToken]);
    return database.prepare(
      `INSERT INTO recipe_categories (recipe_id, category_id) ${selects}`,
    ).bind(...values);
  });
}

function guardedIngredientStatements(
  database: D1Database,
  recipeId: string,
  writeToken: string,
  draft: RecipeDraft,
): D1PreparedStatement[] {
  return chunk(draft.ingredients, 10).map((group, groupIndex) => {
    const selects = group.map(() =>
      "SELECT ?, ?, ?, ?, ?, ?, ? FROM recipes WHERE id = ? AND revision_write_token = ?"
    ).join(" UNION ALL ");
    const values: Array<string | number | null> = [];
    group.forEach((ingredient, index) => {
      values.push(
        `ingredient_${crypto.randomUUID()}`,
        recipeId,
        ingredient.item,
        ingredient.amount || null,
        ingredient.unit || null,
        ingredient.note || null,
        groupIndex * 10 + index + 1,
        recipeId,
        writeToken,
      );
    });
    return database.prepare(
      `INSERT INTO recipe_ingredients (id, recipe_id, item, amount, unit, note, sort_order) ${selects}`,
    ).bind(...values);
  });
}

function guardedStepStatements(
  database: D1Database,
  recipeId: string,
  writeToken: string,
  draft: RecipeDraft,
): D1PreparedStatement[] {
  return chunk(draft.steps, 12).map((group, groupIndex) => {
    const selects = group.map(() =>
      "SELECT ?, ?, ?, ?, ?, ? FROM recipes WHERE id = ? AND revision_write_token = ?"
    ).join(" UNION ALL ");
    const values: Array<string | number | null> = [];
    group.forEach((step, index) => {
      values.push(
        `step_${crypto.randomUUID()}`,
        recipeId,
        step.instruction,
        null,
        step.timerMinutes === null ? null : step.timerMinutes * 60,
        groupIndex * 12 + index + 1,
        recipeId,
        writeToken,
      );
    });
    return database.prepare(
      `INSERT INTO recipe_steps (id, recipe_id, instruction, image_key, timer_seconds, sort_order) ${selects}`,
    ).bind(...values);
  });
}

export async function resubmitRecipeRevision(input: {
  recipeId: string;
  userId: string;
  expectedRevision: number;
  draft: RecipeDraft;
  note?: string;
}) {
  const readiness = getRecipeSubmissionReadiness();
  if (!readiness.ready) throw new RecipeSubmissionError("unavailable", "Recipe resubmission is not ready.");
  if (!input.draft.mediaAssetId) throw new RecipeSubmissionError("invalid", "Upload and attach a recipe image before resubmitting.");

  const database = getDatabase()!;
  const current = await findEditableRecipe(database, input.userId, input.recipeId);
  if (!current) throw new RecipeSubmissionError("forbidden", "This recipe is not available for contributor editing.");
  if (current.revision !== input.expectedRevision) {
    throw new RecipeSubmissionError("conflict", "This recipe changed after the editor was opened.");
  }

  const [currentContent, categories, media] = await Promise.all([
    loadRecipeContent(database, input.recipeId),
    resolveCategories(database, input.draft.categories),
    resolveOwnedHeroMedia(database, input.userId, input.draft.mediaAssetId, input.recipeId),
  ]);

  const baselineDraft = toDraft(current, currentContent, current.media_asset_id);
  const baselineJson = JSON.stringify(baselineDraft);
  const nextJson = JSON.stringify(input.draft);
  if (baselineJson.length > 100000 || nextJson.length > 100000) {
    throw new RecipeSubmissionError("invalid", "Recipe revision snapshot is too large.");
  }

  const writeToken = `recipe_write_${crypto.randomUUID()}`;
  const note = cleanNote(input.note) ?? "Resubmitted after requested changes.";
  const imageUrl = `/media/${media.r2_key}`;
  const nextContentRevision = current.content_revision + 1;
  const statements: D1PreparedStatement[] = [
    database.prepare(
      `UPDATE recipes
       SET title = ?, summary = ?, description = ?, image_key = ?, image_url = ?, media_asset_id = ?,
           country_code = ?, language_code = ?, measurement_system = ?, prep_minutes = ?, cook_minutes = ?,
           servings = ?, difficulty = ?, status = 'review', revision = revision + 1,
           content_revision = content_revision + 1, submitted_at = CURRENT_TIMESTAMP,
           resubmitted_at = CURRENT_TIMESTAMP, editorial_actor_id = ?, editorial_reason = ?,
           change_requested_at = NULL, revision_write_token = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND author_id = ? AND status = 'draft' AND revision = ?`,
    ).bind(
      input.draft.title,
      input.draft.summary,
      input.draft.description || null,
      media.r2_key,
      imageUrl,
      media.id,
      input.draft.countryCode,
      input.draft.languageCode,
      input.draft.measurementSystem,
      input.draft.prepMinutes,
      input.draft.cookMinutes,
      input.draft.servings,
      input.draft.difficulty,
      input.userId,
      note,
      writeToken,
      input.recipeId,
      input.userId,
      input.expectedRevision,
    ),
    database.prepare(
      `INSERT OR IGNORE INTO recipe_revision_snapshots (
         id, recipe_id, content_revision, author_id, source, content_json, created_at
       )
       SELECT ?, id, ?, author_id, ?, ?, CURRENT_TIMESTAMP
       FROM recipes
       WHERE id = ? AND revision_write_token = ?`,
    ).bind(
      `recipe_snapshot_${crypto.randomUUID()}`,
      current.content_revision,
      current.content_revision === 1 ? "initial_submission" : "resubmission",
      baselineJson,
      input.recipeId,
      writeToken,
    ),
    database.prepare(
      `DELETE FROM recipe_categories
       WHERE recipe_id = ?
         AND EXISTS (SELECT 1 FROM recipes WHERE id = ? AND revision_write_token = ?)`,
    ).bind(input.recipeId, input.recipeId, writeToken),
  ];

  statements.push(...guardedCategoryStatements(database, input.recipeId, writeToken, categories));
  statements.push(
    database.prepare(
      `DELETE FROM recipe_ingredients
       WHERE recipe_id = ?
         AND EXISTS (SELECT 1 FROM recipes WHERE id = ? AND revision_write_token = ?)`,
    ).bind(input.recipeId, input.recipeId, writeToken),
  );
  statements.push(...guardedIngredientStatements(database, input.recipeId, writeToken, input.draft));
  statements.push(
    database.prepare(
      `DELETE FROM recipe_steps
       WHERE recipe_id = ?
         AND EXISTS (SELECT 1 FROM recipes WHERE id = ? AND revision_write_token = ?)`,
    ).bind(input.recipeId, input.recipeId, writeToken),
  );
  statements.push(...guardedStepStatements(database, input.recipeId, writeToken, input.draft));
  statements.push(
    database.prepare(
      `INSERT INTO recipe_revision_snapshots (
         id, recipe_id, content_revision, author_id, source, content_json, created_at
       )
       SELECT ?, id, content_revision, author_id, 'resubmission', ?, CURRENT_TIMESTAMP
       FROM recipes
       WHERE id = ? AND revision_write_token = ?`,
    ).bind(`recipe_snapshot_${crypto.randomUUID()}`, nextJson, input.recipeId, writeToken),
    database.prepare(
      `UPDATE recipes SET revision_write_token = NULL
       WHERE id = ? AND revision_write_token = ?`,
    ).bind(input.recipeId, writeToken),
  );

  const results = await database.batch(statements);
  if (!results.every((result) => result.success)) {
    throw new RecipeSubmissionError("unavailable", "The complete recipe revision could not be committed.");
  }
  if ((results[0]?.meta.changes ?? 0) !== 1) {
    throw new RecipeSubmissionError("conflict", "The recipe changed concurrently. Reload the contributor editor.");
  }

  return {
    id: input.recipeId,
    status: "review" as const,
    revision: input.expectedRevision + 1,
    contentRevision: nextContentRevision,
    mediaModerationStatus: media.moderation_status,
  };
}
