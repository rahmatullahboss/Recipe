import { env } from "cloudflare:workers";
import { MEDIA_DERIVATIVE_POLICY_VERSION, mediaDeliveryUrl } from "./media-policy";
import { validateRecipeDraft, type RecipeDraft } from "./recipe-draft";
import { getRecipeSubmissionReadiness, RecipeSubmissionError } from "./recipe-submissions";

export type PublishedRecipeChangeSetStatus =
  | "draft"
  | "review"
  | "changes_requested"
  | "approved"
  | "cancelled"
  | "superseded";

type ChangeSetBindings = { DB?: D1Database };
type CategoryRow = { id: string; slug: string };
type IngredientRow = { item: string; amount: string | null; unit: string | null; note: string | null };
type StepRow = { instruction: string; timer_seconds: number | null };
type CategorySlugRow = { slug: string };

type PublishedRecipeRow = {
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
  status: "published";
  revision: number;
  content_revision: number;
  slug: string;
  media_upload_status: string | null;
  media_moderation_status: string | null;
  media_r2_key: string | null;
  media_sha256: string | null;
  media_alt_text: string | null;
};

type ChangeSetRow = {
  id: string;
  recipe_id: string;
  owner_id: string;
  status: PublishedRecipeChangeSetStatus;
  revision: number;
  base_recipe_revision: number;
  base_content_revision: number;
  resulting_recipe_revision: number | null;
  media_asset_id: string | null;
  base_content_json: string;
  content_json: string;
  contributor_note: string | null;
  editorial_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  promoted_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

type MediaRow = {
  id: string;
  owner_id: string;
  r2_key: string;
  moderation_status: string;
  sha256: string;
  alt_text: string | null;
};

const bindings = env as unknown as ChangeSetBindings;
const ACTIVE_CHANGE_SET_STATUSES = "'draft', 'review', 'changes_requested'";

function getDatabase(): D1Database | undefined {
  return bindings.DB;
}

function cleanNote(value: string | undefined, fallback: string | null = null): string | null {
  const note = value?.trim().replace(/\s+/g, " ").slice(0, 1000) ?? "";
  return note || fallback;
}

function parseDraftJson(value: string): RecipeDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new RecipeSubmissionError("unavailable", "Stored recipe change-set content is invalid.");
  }
  const validation = validateRecipeDraft(parsed);
  if (!validation.valid || !validation.draft) {
    throw new RecipeSubmissionError("unavailable", "Stored recipe change-set content no longer passes canonical validation.");
  }
  return validation.draft;
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
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

async function loadRecipeContent(database: D1Database, recipeId: string) {
  const [ingredients, steps, categories] = await Promise.all([
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
    ingredients: ingredients.results ?? [],
    steps: steps.results ?? [],
    categories: categories.results ?? [],
  };
}

function toDraft(
  recipe: PublishedRecipeRow,
  content: Awaited<ReturnType<typeof loadRecipeContent>>,
  mediaAssetId: string | null,
): RecipeDraft {
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

async function findOwnedPublishedRecipe(
  database: D1Database,
  userId: string,
  recipeId: string,
): Promise<PublishedRecipeRow | null> {
  return database.prepare(
    `SELECT r.id, r.author_id, r.title, r.summary, r.description, r.media_asset_id,
            r.country_code, r.language_code, r.measurement_system, r.prep_minutes,
            r.cook_minutes, r.servings, r.difficulty, r.status, r.revision,
            r.content_revision, r.slug,
            m.upload_status AS media_upload_status,
            m.moderation_status AS media_moderation_status,
            m.r2_key AS media_r2_key,
            m.sha256 AS media_sha256,
            m.alt_text AS media_alt_text
     FROM recipes r
     LEFT JOIN media_assets m ON m.id = r.media_asset_id
     WHERE r.id = ? AND r.author_id = ? AND r.status = 'published'
     LIMIT 1`,
  ).bind(recipeId, userId).first<PublishedRecipeRow>();
}

async function findActiveOwnerChangeSet(
  database: D1Database,
  userId: string,
  recipeId: string,
): Promise<ChangeSetRow | null> {
  return database.prepare(
    `SELECT * FROM recipe_change_sets
     WHERE recipe_id = ? AND owner_id = ?
       AND status IN (${ACTIVE_CHANGE_SET_STATUSES})
     LIMIT 1`,
  ).bind(recipeId, userId).first<ChangeSetRow>();
}

async function resolveOwnedChangeSetMedia(input: {
  database: D1Database;
  userId: string;
  mediaAssetId: string;
  recipeId: string;
  changeSetId: string;
  requireApproval: boolean;
}): Promise<MediaRow> {
  const moderationClause = input.requireApproval
    ? "m.moderation_status = 'approved'"
    : "m.moderation_status IN ('pending', 'approved')";
  const media = await input.database.prepare(
    `SELECT m.id, m.owner_id, m.r2_key, m.moderation_status, m.sha256, m.alt_text
     FROM media_assets m
     WHERE m.id = ?
       AND m.owner_id = ?
       AND m.upload_status = 'uploaded'
       AND m.purpose = 'recipe_hero'
       AND ${moderationClause}
       AND m.sha256 IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM media_derivative_jobs j
         WHERE j.media_id = m.id
           AND j.status = 'ready'
           AND j.policy_version = '${MEDIA_DERIVATIVE_POLICY_VERSION}'
           AND j.source_sha256 = m.sha256
           AND j.required_variant_count > 0
           AND j.ready_variant_count >= j.required_variant_count
       )
       AND NOT EXISTS (
         SELECT 1 FROM recipes assigned
         WHERE assigned.media_asset_id = m.id AND assigned.id <> ?
       )
       AND NOT EXISTS (
         SELECT 1 FROM recipe_change_sets reserved
         WHERE reserved.media_asset_id = m.id
           AND reserved.id <> ?
           AND reserved.status IN (${ACTIVE_CHANGE_SET_STATUSES})
       )
     LIMIT 1`,
  ).bind(input.mediaAssetId, input.userId, input.recipeId, input.changeSetId).first<MediaRow>();
  if (!media) {
    const state = input.requireApproval ? "approved" : "pending or approved";
    throw new RecipeSubmissionError(
      "invalid",
      `Attach an owned ${state} recipe image with complete privacy-safe derivatives that is not reserved elsewhere.`,
    );
  }
  return media;
}

function eventStatement(
  database: D1Database,
  input: {
    changeSetId: string;
    actorId: string;
    action: "create" | "save" | "submit" | "request_changes" | "cancel" | "approve";
    previousStatus: PublishedRecipeChangeSetStatus | null;
    nextStatus: PublishedRecipeChangeSetStatus;
    expectedStoredRevision: number;
    reason: string | null;
    resultingRecipeRevision?: number | null;
  },
): D1PreparedStatement {
  return database.prepare(
    `INSERT INTO recipe_change_set_events (
       id, change_set_id, recipe_id, actor_id, action, previous_status, next_status,
       change_set_revision, base_recipe_revision, resulting_recipe_revision, reason, created_at
     )
     SELECT ?, id, recipe_id, ?, ?, ?, ?, revision, base_recipe_revision, ?, ?, CURRENT_TIMESTAMP
     FROM recipe_change_sets
     WHERE id = ? AND revision = ? AND status = ?`,
  ).bind(
    `recipe_change_event_${crypto.randomUUID()}`,
    input.actorId,
    input.action,
    input.previousStatus,
    input.nextStatus,
    input.resultingRecipeRevision ?? null,
    input.reason,
    input.changeSetId,
    input.expectedStoredRevision,
    input.nextStatus,
  );
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
    return database.prepare(`INSERT INTO recipe_categories (recipe_id, category_id) ${selects}`).bind(...values);
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

export function getPublishedRecipeChangeSetReadiness() {
  const submissions = getRecipeSubmissionReadiness();
  return {
    ready: submissions.ready,
    database: Boolean(getDatabase()),
    livePublishedRowIsolation: true,
    oneActiveChangeSetPerRecipe: true,
    privateJsonSnapshots: true,
    optimisticChangeSetRevision: true,
    baseRecipeRevisionGuard: true,
    mediaReservation: true,
    approvalMediaRevalidation: true,
    atomicRelationalPromotion: true,
    immutableAuditEvents: true,
  };
}

export async function getContributorPublishedChangeSetEditor(userId: string, recipeId: string) {
  const database = getDatabase();
  if (!database) return null;
  const recipe = await findOwnedPublishedRecipe(database, userId, recipeId);
  if (!recipe) return null;
  const [content, changeSet] = await Promise.all([
    loadRecipeContent(database, recipeId),
    findActiveOwnerChangeSet(database, userId, recipeId),
  ]);
  const liveDraft = toDraft(recipe, content, recipe.media_asset_id);
  const draft = changeSet ? parseDraftJson(changeSet.content_json) : liveDraft;
  const selectedMediaId = draft.mediaAssetId;
  const selectedMedia = selectedMediaId
    ? await database.prepare(
      `SELECT id, r2_key, sha256, alt_text, moderation_status
       FROM media_assets
       WHERE id = ? AND owner_id = ? AND upload_status = 'uploaded'
         AND moderation_status IN ('pending', 'approved')
       LIMIT 1`,
    ).bind(selectedMediaId, userId).first<{
      id: string;
      r2_key: string;
      sha256: string;
      alt_text: string | null;
      moderation_status: string;
    }>()
    : null;

  return {
    recipe: {
      id: recipe.id,
      slug: recipe.slug,
      title: recipe.title,
      revision: recipe.revision,
      contentRevision: recipe.content_revision,
    },
    changeSet: changeSet ? {
      id: changeSet.id,
      status: changeSet.status,
      revision: changeSet.revision,
      baseRecipeRevision: changeSet.base_recipe_revision,
      baseContentRevision: changeSet.base_content_revision,
      contributorNote: changeSet.contributor_note,
      editorialReason: changeSet.editorial_reason,
      submittedAt: changeSet.submitted_at,
      updatedAt: changeSet.updated_at,
    } : null,
    draft,
    liveDraft,
    media: selectedMedia ? {
      id: selectedMedia.id,
      altText: selectedMedia.alt_text,
      moderationStatus: selectedMedia.moderation_status,
      previewUrl: mediaDeliveryUrl(selectedMedia.r2_key, selectedMedia.sha256, true),
    } : null,
  };
}

export async function startPublishedRecipeChangeSet(input: { recipeId: string; userId: string }) {
  if (!getRecipeSubmissionReadiness().ready) {
    throw new RecipeSubmissionError("unavailable", "Published recipe change sets are not ready.");
  }
  const database = getDatabase()!;
  const recipe = await findOwnedPublishedRecipe(database, input.userId, input.recipeId);
  if (!recipe) throw new RecipeSubmissionError("forbidden", "Only your own published recipe can be revised.");
  const existing = await findActiveOwnerChangeSet(database, input.userId, input.recipeId);
  if (existing) return { id: existing.id, status: existing.status, revision: existing.revision, existing: true };

  const content = await loadRecipeContent(database, input.recipeId);
  const draft = toDraft(recipe, content, recipe.media_asset_id);
  const contentJson = JSON.stringify(draft);
  if (contentJson.length > 100000) throw new RecipeSubmissionError("invalid", "Published recipe content is too large for a change set.");

  const changeSetId = `recipe_change_${crypto.randomUUID()}`;
  try {
    const results = await database.batch([
      database.prepare(
        `INSERT INTO recipe_change_sets (
           id, recipe_id, owner_id, created_by, status, revision,
           base_recipe_revision, base_content_revision, media_asset_id,
           base_content_json, content_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'draft', 1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      ).bind(
        changeSetId,
        input.recipeId,
        input.userId,
        input.userId,
        recipe.revision,
        recipe.content_revision,
        recipe.media_asset_id,
        contentJson,
        contentJson,
      ),
      eventStatement(database, {
        changeSetId,
        actorId: input.userId,
        action: "create",
        previousStatus: null,
        nextStatus: "draft",
        expectedStoredRevision: 1,
        reason: "Private change set created from the current published recipe.",
      }),
    ]);
    if (!results.every((result) => result.success) || (results[0]?.meta.changes ?? 0) !== 1) {
      throw new RecipeSubmissionError("conflict", "A published recipe change set already exists or the recipe changed concurrently.");
    }
  } catch (error) {
    if (error instanceof RecipeSubmissionError) throw error;
    throw new RecipeSubmissionError("conflict", "A published recipe change set already exists or the recipe changed concurrently.");
  }
  return { id: changeSetId, status: "draft" as const, revision: 1, existing: false };
}

export async function savePublishedRecipeChangeSet(input: {
  recipeId: string;
  changeSetId: string;
  userId: string;
  expectedRevision: number;
  draft: RecipeDraft;
  note?: string;
  submit: boolean;
}) {
  if (!getRecipeSubmissionReadiness().ready) {
    throw new RecipeSubmissionError("unavailable", "Published recipe change sets are not ready.");
  }
  if (!input.draft.mediaAssetId) throw new RecipeSubmissionError("invalid", "Attach a recipe image before saving this change set.");
  const database = getDatabase()!;
  const current = await database.prepare(
    `SELECT * FROM recipe_change_sets
     WHERE id = ? AND recipe_id = ? AND owner_id = ?
       AND status IN ('draft', 'changes_requested')
     LIMIT 1`,
  ).bind(input.changeSetId, input.recipeId, input.userId).first<ChangeSetRow>();
  if (!current) throw new RecipeSubmissionError("forbidden", "This private change set is not available for contributor editing.");
  if (current.revision !== input.expectedRevision) {
    throw new RecipeSubmissionError("conflict", "This change set changed after the editor was opened.");
  }

  const live = await findOwnedPublishedRecipe(database, input.userId, input.recipeId);
  if (!live || live.revision !== current.base_recipe_revision || live.content_revision !== current.base_content_revision) {
    throw new RecipeSubmissionError("conflict", "The published recipe changed after this change set was created. Cancel it and start from the latest version.");
  }
  const [categories, media] = await Promise.all([
    resolveCategories(database, input.draft.categories),
    resolveOwnedChangeSetMedia({
      database,
      userId: input.userId,
      mediaAssetId: input.draft.mediaAssetId,
      recipeId: input.recipeId,
      changeSetId: input.changeSetId,
      requireApproval: false,
    }),
  ]);
  if (!categories.length) throw new RecipeSubmissionError("invalid", "Select at least one valid category.");

  const contentJson = JSON.stringify(input.draft);
  if (contentJson.length > 100000) throw new RecipeSubmissionError("invalid", "Recipe change-set content is too large.");
  const note = cleanNote(input.note);
  const previousStatus = current.status;
  const nextStatus: PublishedRecipeChangeSetStatus = input.submit ? "review" : current.status;
  const nextRevision = input.expectedRevision + 1;
  const update = database.prepare(
    `UPDATE recipe_change_sets
     SET content_json = ?, media_asset_id = ?, contributor_note = ?, status = ?,
         revision = revision + 1,
         editorial_reason = CASE WHEN ? = 'review' THEN NULL ELSE editorial_reason END,
         submitted_at = CASE WHEN ? = 'review' THEN CURRENT_TIMESTAMP ELSE submitted_at END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND recipe_id = ? AND owner_id = ?
       AND status IN ('draft', 'changes_requested') AND revision = ?
       AND base_recipe_revision = ? AND base_content_revision = ?
       AND EXISTS (
         SELECT 1 FROM recipes r
         WHERE r.id = recipe_change_sets.recipe_id
           AND r.author_id = recipe_change_sets.owner_id
           AND r.status = 'published'
           AND r.revision = recipe_change_sets.base_recipe_revision
           AND r.content_revision = recipe_change_sets.base_content_revision
       )`,
  ).bind(
    contentJson,
    media.id,
    note,
    nextStatus,
    nextStatus,
    nextStatus,
    input.changeSetId,
    input.recipeId,
    input.userId,
    input.expectedRevision,
    current.base_recipe_revision,
    current.base_content_revision,
  );
  const results = await database.batch([
    update,
    eventStatement(database, {
      changeSetId: input.changeSetId,
      actorId: input.userId,
      action: input.submit ? "submit" : "save",
      previousStatus,
      nextStatus,
      expectedStoredRevision: nextRevision,
      reason: note,
    }),
  ]);
  if (!results.every((result) => result.success) || (results[0]?.meta.changes ?? 0) !== 1) {
    throw new RecipeSubmissionError("conflict", "The change set or published recipe changed concurrently. Reload the editor.");
  }
  return {
    id: input.changeSetId,
    status: nextStatus,
    revision: nextRevision,
    mediaModerationStatus: media.moderation_status,
  };
}

export async function cancelPublishedRecipeChangeSet(input: {
  recipeId: string;
  changeSetId: string;
  userId: string;
  expectedRevision: number;
  reason?: string;
}) {
  const database = getDatabase();
  if (!database) throw new RecipeSubmissionError("unavailable", "Published recipe change sets are unavailable.");
  const reason = cleanNote(input.reason, "Contributor cancelled the private change set.");
  const nextRevision = input.expectedRevision + 1;
  const current = await database.prepare(
    `SELECT status FROM recipe_change_sets
     WHERE id = ? AND recipe_id = ? AND owner_id = ?
       AND status IN (${ACTIVE_CHANGE_SET_STATUSES}) AND revision = ?
     LIMIT 1`,
  ).bind(input.changeSetId, input.recipeId, input.userId, input.expectedRevision).first<{ status: PublishedRecipeChangeSetStatus }>();
  if (!current) throw new RecipeSubmissionError("conflict", "This change set changed or is no longer active.");
  const results = await database.batch([
    database.prepare(
      `UPDATE recipe_change_sets
       SET status = 'cancelled', revision = revision + 1, cancelled_at = CURRENT_TIMESTAMP,
           contributor_note = COALESCE(?, contributor_note), updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND recipe_id = ? AND owner_id = ?
         AND status IN (${ACTIVE_CHANGE_SET_STATUSES}) AND revision = ?`,
    ).bind(reason, input.changeSetId, input.recipeId, input.userId, input.expectedRevision),
    eventStatement(database, {
      changeSetId: input.changeSetId,
      actorId: input.userId,
      action: "cancel",
      previousStatus: current.status,
      nextStatus: "cancelled",
      expectedStoredRevision: nextRevision,
      reason,
    }),
  ]);
  if (!results.every((result) => result.success) || (results[0]?.meta.changes ?? 0) !== 1) {
    throw new RecipeSubmissionError("conflict", "The change set changed concurrently.");
  }
  return { id: input.changeSetId, status: "cancelled" as const, revision: nextRevision };
}

export async function listPublishedRecipeChangeSetQueue(limit = 100) {
  const database = getDatabase();
  if (!database) return [];
  const bounded = Math.min(Math.max(limit, 1), 100);
  const result = await database.prepare(
    `SELECT cs.id, cs.recipe_id, cs.status, cs.revision, cs.base_recipe_revision,
            cs.base_content_revision, cs.submitted_at, cs.updated_at,
            r.title AS live_title, r.slug, r.revision AS live_revision,
            r.content_revision AS live_content_revision,
            u.display_name AS owner_name, u.email AS owner_email,
            m.moderation_status AS media_moderation_status
     FROM recipe_change_sets cs
     JOIN recipes r ON r.id = cs.recipe_id
     JOIN users u ON u.id = cs.owner_id
     LEFT JOIN media_assets m ON m.id = cs.media_asset_id
     WHERE cs.status = 'review'
     ORDER BY cs.submitted_at ASC, cs.created_at ASC
     LIMIT ?`,
  ).bind(bounded).all();
  return result.results ?? [];
}

export async function getEditorialPublishedRecipeChangeSet(changeSetId: string) {
  const database = getDatabase();
  if (!database) return null;
  const changeSet = await database.prepare(
    `SELECT cs.*, r.title AS live_title, r.slug, r.status AS live_status,
            r.revision AS live_revision, r.content_revision AS live_content_revision,
            u.display_name AS owner_name, u.email AS owner_email,
            m.r2_key, m.sha256, m.alt_text, m.upload_status AS media_upload_status,
            m.moderation_status AS media_moderation_status
     FROM recipe_change_sets cs
     JOIN recipes r ON r.id = cs.recipe_id
     JOIN users u ON u.id = cs.owner_id
     LEFT JOIN media_assets m ON m.id = cs.media_asset_id
     WHERE cs.id = ?
     LIMIT 1`,
  ).bind(changeSetId).first<Record<string, unknown> & ChangeSetRow>();
  if (!changeSet) return null;
  const events = await database.prepare(
    `SELECT e.action, e.previous_status, e.next_status, e.change_set_revision,
            e.base_recipe_revision, e.resulting_recipe_revision, e.reason, e.created_at,
            u.display_name AS actor_name
     FROM recipe_change_set_events e
     JOIN users u ON u.id = e.actor_id
     WHERE e.change_set_id = ?
     ORDER BY e.created_at DESC`,
  ).bind(changeSetId).all();
  const proposedDraft = parseDraftJson(changeSet.content_json);
  const baselineDraft = parseDraftJson(changeSet.base_content_json);
  const previewUrl = typeof changeSet.r2_key === "string" && typeof changeSet.sha256 === "string"
    ? mediaDeliveryUrl(changeSet.r2_key, changeSet.sha256, true)
    : null;
  return { changeSet, proposedDraft, baselineDraft, previewUrl, events: events.results ?? [] };
}

export async function requestPublishedRecipeChangeSetChanges(input: {
  changeSetId: string;
  actorId: string;
  expectedRevision: number;
  reason?: string;
}) {
  const reason = cleanNote(input.reason);
  if (!reason || reason.length < 10) {
    throw new RecipeSubmissionError("invalid", "Describe the required changes with at least 10 characters.");
  }
  const database = getDatabase();
  if (!database) throw new RecipeSubmissionError("unavailable", "Published recipe change sets are unavailable.");
  const nextRevision = input.expectedRevision + 1;
  const results = await database.batch([
    database.prepare(
      `UPDATE recipe_change_sets
       SET status = 'changes_requested', revision = revision + 1,
           editorial_reason = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'review' AND revision = ?
         AND EXISTS (
           SELECT 1 FROM recipes r
           WHERE r.id = recipe_change_sets.recipe_id
             AND r.status = 'published'
             AND r.revision = recipe_change_sets.base_recipe_revision
             AND r.content_revision = recipe_change_sets.base_content_revision
         )`,
    ).bind(reason, input.changeSetId, input.expectedRevision),
    eventStatement(database, {
      changeSetId: input.changeSetId,
      actorId: input.actorId,
      action: "request_changes",
      previousStatus: "review",
      nextStatus: "changes_requested",
      expectedStoredRevision: nextRevision,
      reason,
    }),
  ]);
  if (!results.every((result) => result.success) || (results[0]?.meta.changes ?? 0) !== 1) {
    throw new RecipeSubmissionError("conflict", "The change set or published recipe changed concurrently.");
  }
  return { id: input.changeSetId, status: "changes_requested" as const, revision: nextRevision };
}

export async function cancelPublishedRecipeChangeSetEditorial(input: {
  changeSetId: string;
  actorId: string;
  expectedRevision: number;
  reason?: string;
}) {
  const reason = cleanNote(input.reason);
  if (!reason || reason.length < 5) {
    throw new RecipeSubmissionError("invalid", "Add a clear editorial reason before closing the change set.");
  }
  const database = getDatabase();
  if (!database) throw new RecipeSubmissionError("unavailable", "Published recipe change sets are unavailable.");
  const nextRevision = input.expectedRevision + 1;
  const results = await database.batch([
    database.prepare(
      `UPDATE recipe_change_sets
       SET status = 'cancelled', revision = revision + 1, editorial_reason = ?,
           reviewed_at = CURRENT_TIMESTAMP, cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'review' AND revision = ?`,
    ).bind(reason, input.changeSetId, input.expectedRevision),
    eventStatement(database, {
      changeSetId: input.changeSetId,
      actorId: input.actorId,
      action: "cancel",
      previousStatus: "review",
      nextStatus: "cancelled",
      expectedStoredRevision: nextRevision,
      reason,
    }),
  ]);
  if (!results.every((result) => result.success) || (results[0]?.meta.changes ?? 0) !== 1) {
    throw new RecipeSubmissionError("conflict", "The change set changed concurrently.");
  }
  return { id: input.changeSetId, status: "cancelled" as const, revision: nextRevision };
}

export async function approvePublishedRecipeChangeSet(input: {
  changeSetId: string;
  actorId: string;
  expectedRevision: number;
  reason?: string;
}) {
  if (!getRecipeSubmissionReadiness().ready) {
    throw new RecipeSubmissionError("unavailable", "Published recipe change-set approval is not ready.");
  }
  const database = getDatabase()!;
  const current = await database.prepare(
    `SELECT * FROM recipe_change_sets WHERE id = ? AND status = 'review' AND revision = ? LIMIT 1`,
  ).bind(input.changeSetId, input.expectedRevision).first<ChangeSetRow>();
  if (!current) throw new RecipeSubmissionError("conflict", "This change set is no longer awaiting review.");
  const draft = parseDraftJson(current.content_json);
  if (!draft.mediaAssetId) throw new RecipeSubmissionError("invalid", "The proposed recipe must include an approved hero image.");
  const live = await findOwnedPublishedRecipe(database, current.owner_id, current.recipe_id);
  if (!live || live.revision !== current.base_recipe_revision || live.content_revision !== current.base_content_revision) {
    throw new RecipeSubmissionError("conflict", "The live published recipe changed after this change set was created.");
  }
  const [categories, media] = await Promise.all([
    resolveCategories(database, draft.categories),
    resolveOwnedChangeSetMedia({
      database,
      userId: current.owner_id,
      mediaAssetId: draft.mediaAssetId,
      recipeId: current.recipe_id,
      changeSetId: current.id,
      requireApproval: true,
    }),
  ]);
  if (!categories.length) throw new RecipeSubmissionError("invalid", "The proposed recipe requires at least one valid category.");

  const reason = cleanNote(input.reason, "Approved published recipe change set.");
  const writeToken = `published_change_write_${crypto.randomUUID()}`;
  const nextRecipeRevision = current.base_recipe_revision + 1;
  const nextContentRevision = current.base_content_revision + 1;
  const nextChangeSetRevision = input.expectedRevision + 1;
  const imageUrl = mediaDeliveryUrl(media.r2_key, media.sha256);
  const statements: D1PreparedStatement[] = [
    database.prepare(
      `UPDATE recipes
       SET title = ?, summary = ?, description = ?, image_key = ?, image_url = ?, media_asset_id = ?,
           country_code = ?, language_code = ?, measurement_system = ?, prep_minutes = ?, cook_minutes = ?,
           servings = ?, difficulty = ?, revision = revision + 1, content_revision = content_revision + 1,
           editorial_actor_id = ?, editorial_reason = ?, reviewed_at = CURRENT_TIMESTAMP,
           scheduled_publish_at = NULL, scheduled_by = NULL, schedule_revision = NULL,
           revision_write_token = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND author_id = ? AND status = 'published'
         AND revision = ? AND content_revision = ?
         AND EXISTS (
           SELECT 1 FROM recipe_change_sets cs
           WHERE cs.id = ? AND cs.recipe_id = recipes.id AND cs.owner_id = recipes.author_id
             AND cs.status = 'review' AND cs.revision = ?
             AND cs.base_recipe_revision = recipes.revision
             AND cs.base_content_revision = recipes.content_revision
         )
         AND EXISTS (
           SELECT 1 FROM media_assets m
           WHERE m.id = ? AND m.owner_id = recipes.author_id
             AND m.upload_status = 'uploaded' AND m.moderation_status = 'approved'
             AND m.purpose = 'recipe_hero' AND m.sha256 = ?
             AND EXISTS (
               SELECT 1 FROM media_derivative_jobs j
               WHERE j.media_id = m.id AND j.status = 'ready'
                 AND j.policy_version = '${MEDIA_DERIVATIVE_POLICY_VERSION}'
                 AND j.source_sha256 = m.sha256
                 AND j.required_variant_count > 0
                 AND j.ready_variant_count >= j.required_variant_count
             )
             AND NOT EXISTS (
               SELECT 1 FROM recipes assigned
               WHERE assigned.media_asset_id = m.id AND assigned.id <> recipes.id
             )
         )`,
    ).bind(
      draft.title,
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
      input.actorId,
      reason,
      writeToken,
      current.recipe_id,
      current.owner_id,
      current.base_recipe_revision,
      current.base_content_revision,
      current.id,
      input.expectedRevision,
      media.id,
      media.sha256,
    ),
    database.prepare(
      `DELETE FROM recipe_categories
       WHERE recipe_id = ?
         AND EXISTS (SELECT 1 FROM recipes WHERE id = ? AND revision_write_token = ?)`,
    ).bind(current.recipe_id, current.recipe_id, writeToken),
  ];
  statements.push(...guardedCategoryStatements(database, current.recipe_id, writeToken, categories));
  statements.push(
    database.prepare(
      `DELETE FROM recipe_ingredients
       WHERE recipe_id = ?
         AND EXISTS (SELECT 1 FROM recipes WHERE id = ? AND revision_write_token = ?)`,
    ).bind(current.recipe_id, current.recipe_id, writeToken),
  );
  statements.push(...guardedIngredientStatements(database, current.recipe_id, writeToken, draft));
  statements.push(
    database.prepare(
      `DELETE FROM recipe_steps
       WHERE recipe_id = ?
         AND EXISTS (SELECT 1 FROM recipes WHERE id = ? AND revision_write_token = ?)`,
    ).bind(current.recipe_id, current.recipe_id, writeToken),
  );
  statements.push(...guardedStepStatements(database, current.recipe_id, writeToken, draft));
  const changeSetUpdateIndex = statements.length;
  statements.push(
    database.prepare(
      `UPDATE recipe_change_sets
       SET status = 'approved', revision = revision + 1, editorial_reason = ?,
           reviewed_at = CURRENT_TIMESTAMP, promoted_at = CURRENT_TIMESTAMP,
           resulting_recipe_revision = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'review' AND revision = ?
         AND base_recipe_revision = ? AND base_content_revision = ?
         AND EXISTS (
           SELECT 1 FROM recipes r
           WHERE r.id = recipe_change_sets.recipe_id
             AND r.revision_write_token = ?
             AND r.revision = ? AND r.content_revision = ?
         )`,
    ).bind(
      reason,
      nextRecipeRevision,
      current.id,
      input.expectedRevision,
      current.base_recipe_revision,
      current.base_content_revision,
      writeToken,
      nextRecipeRevision,
      nextContentRevision,
    ),
    eventStatement(database, {
      changeSetId: current.id,
      actorId: input.actorId,
      action: "approve",
      previousStatus: "review",
      nextStatus: "approved",
      expectedStoredRevision: nextChangeSetRevision,
      reason,
      resultingRecipeRevision: nextRecipeRevision,
    }),
    database.prepare(
      `UPDATE recipes SET revision_write_token = NULL
       WHERE id = ? AND revision_write_token = ?`,
    ).bind(current.recipe_id, writeToken),
  );

  const results = await database.batch(statements);
  if (!results.every((result) => result.success)) {
    throw new RecipeSubmissionError("unavailable", "The complete published recipe promotion could not be committed.");
  }
  if ((results[0]?.meta.changes ?? 0) !== 1 || (results[changeSetUpdateIndex]?.meta.changes ?? 0) !== 1) {
    throw new RecipeSubmissionError("conflict", "The live recipe, change set, or attached media changed concurrently.");
  }
  return {
    id: current.id,
    recipeId: current.recipe_id,
    status: "approved" as const,
    revision: nextChangeSetRevision,
    recipeRevision: nextRecipeRevision,
    contentRevision: nextContentRevision,
  };
}
