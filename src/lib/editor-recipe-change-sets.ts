import { env } from "cloudflare:workers";
import { MEDIA_DERIVATIVE_POLICY_VERSION, mediaDeliveryUrl } from "./media-policy";
import { validateRecipeDraft, type RecipeDraft } from "./recipe-draft";
import { getRecipeSubmissionReadiness, RecipeSubmissionError } from "./recipe-submissions";

type Bindings = { DB?: D1Database };
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
};
type ActiveChangeSetRow = {
  id: string;
  recipe_id: string;
  owner_id: string;
  created_by: string;
  status: "draft" | "review" | "changes_requested";
  revision: number;
  base_recipe_revision: number;
  base_content_revision: number;
  media_asset_id: string | null;
  base_content_json: string;
  content_json: string;
  contributor_note: string | null;
  editorial_reason: string | null;
  submitted_at: string | null;
  updated_at: string;
  source_type: EditorChangeSetSourceType | null;
  source_snapshot_id: string | null;
  source_change_set_id: string | null;
  source_content_revision: number | null;
  media_fallback_applied: number | null;
  creator_name: string | null;
  creator_role: string;
};
type MediaRow = {
  id: string;
  r2_key: string;
  sha256: string;
  alt_text: string | null;
  moderation_status: string;
};
export type EditorChangeSetSourceType =
  | "editor_current"
  | "revision_snapshot"
  | "approved_change_set_proposed"
  | "approved_change_set_baseline";

type HistoricalSource = {
  sourceType: EditorChangeSetSourceType;
  sourceSnapshotId: string | null;
  sourceChangeSetId: string | null;
  sourceContentRevision: number | null;
  draft: RecipeDraft;
  label: string;
};

const bindings = env as unknown as Bindings;
const ACTIVE_STATUSES = "'draft', 'review', 'changes_requested'";

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
    throw new RecipeSubmissionError("unavailable", "Stored historical recipe content is invalid.");
  }
  const validation = validateRecipeDraft(parsed);
  if (!validation.valid || !validation.draft) {
    throw new RecipeSubmissionError("unavailable", "Stored historical recipe content no longer passes canonical validation.");
  }
  return validation.draft;
}

async function loadRecipeContent(database: D1Database, recipeId: string) {
  const [ingredients, steps, categories] = await Promise.all([
    database.prepare(
      `SELECT item, amount, unit, note FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order ASC`,
    ).bind(recipeId).all<IngredientRow>(),
    database.prepare(
      `SELECT instruction, timer_seconds FROM recipe_steps WHERE recipe_id = ? ORDER BY sort_order ASC`,
    ).bind(recipeId).all<StepRow>(),
    database.prepare(
      `SELECT c.slug FROM categories c JOIN recipe_categories rc ON rc.category_id = c.id
       WHERE rc.recipe_id = ? ORDER BY c.sort_order ASC, c.name ASC`,
    ).bind(recipeId).all<CategorySlugRow>(),
  ]);
  return {
    ingredients: ingredients.results ?? [],
    steps: steps.results ?? [],
    categories: categories.results ?? [],
  };
}

function toDraft(recipe: PublishedRecipeRow, content: Awaited<ReturnType<typeof loadRecipeContent>>): RecipeDraft {
  return {
    title: recipe.title,
    summary: recipe.summary,
    description: recipe.description ?? "",
    mediaAssetId: recipe.media_asset_id,
    countryCode: recipe.country_code,
    languageCode: recipe.language_code as RecipeDraft["languageCode"],
    measurementSystem: recipe.measurement_system,
    prepMinutes: recipe.prep_minutes,
    cookMinutes: recipe.cook_minutes,
    servings: recipe.servings,
    difficulty: recipe.difficulty,
    categories: content.categories.map((item) => item.slug),
    ingredients: content.ingredients.map((item) => ({
      item: item.item,
      amount: item.amount ?? "",
      unit: item.unit ?? "",
      note: item.note ?? "",
    })),
    steps: content.steps.map((item) => ({
      instruction: item.instruction,
      timerMinutes: item.timer_seconds === null ? null : Math.round(item.timer_seconds / 60),
    })),
  };
}

async function findPublishedRecipe(database: D1Database, recipeId: string): Promise<PublishedRecipeRow | null> {
  return database.prepare(
    `SELECT id, author_id, title, summary, description, media_asset_id, country_code, language_code,
            measurement_system, prep_minutes, cook_minutes, servings, difficulty, status,
            revision, content_revision, slug
     FROM recipes WHERE id = ? AND status = 'published' LIMIT 1`,
  ).bind(recipeId).first<PublishedRecipeRow>();
}

async function findActiveChangeSet(database: D1Database, recipeId: string): Promise<ActiveChangeSetRow | null> {
  return database.prepare(
    `SELECT cs.*, o.source_type, o.source_snapshot_id, o.source_change_set_id,
            o.source_content_revision, o.media_fallback_applied,
            creator.display_name AS creator_name, creator.role AS creator_role
     FROM recipe_change_sets cs
     JOIN users creator ON creator.id = cs.created_by
     LEFT JOIN recipe_change_set_origins o ON o.change_set_id = cs.id
     WHERE cs.recipe_id = ? AND cs.status IN (${ACTIVE_STATUSES})
     LIMIT 1`,
  ).bind(recipeId).first<ActiveChangeSetRow>();
}

async function resolveCategories(database: D1Database, slugs: string[]): Promise<CategoryRow[]> {
  const placeholders = slugs.map(() => "?").join(", ");
  const result = await database.prepare(
    `SELECT id, slug FROM categories WHERE slug IN (${placeholders})`,
  ).bind(...slugs).all<CategoryRow>();
  const categories = result.results ?? [];
  const found = new Set(categories.map((item) => item.slug));
  const missing = slugs.filter((slug) => !found.has(slug));
  if (missing.length) throw new RecipeSubmissionError("invalid", `Unknown categories: ${missing.join(", ")}.`);
  return categories;
}

async function findEligibleOwnerMedia(input: {
  database: D1Database;
  ownerId: string;
  recipeId: string;
  changeSetId: string;
  mediaAssetId: string;
}): Promise<MediaRow | null> {
  return input.database.prepare(
    `SELECT m.id, m.r2_key, m.sha256, m.alt_text, m.moderation_status
     FROM media_assets m
     WHERE m.id = ? AND m.owner_id = ? AND m.upload_status = 'uploaded'
       AND m.purpose = 'recipe_hero' AND m.moderation_status IN ('pending', 'approved')
       AND m.sha256 IS NOT NULL
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
         WHERE assigned.media_asset_id = m.id AND assigned.id <> ?
       )
       AND NOT EXISTS (
         SELECT 1 FROM recipe_change_sets reserved
         WHERE reserved.media_asset_id = m.id AND reserved.id <> ?
           AND reserved.status IN (${ACTIVE_STATUSES})
       )
     LIMIT 1`,
  ).bind(input.mediaAssetId, input.ownerId, input.recipeId, input.changeSetId).first<MediaRow>();
}

async function listEligibleOwnerMedia(
  database: D1Database,
  ownerId: string,
  recipeId: string,
  changeSetId: string,
  limit = 50,
) {
  const result = await database.prepare(
    `SELECT m.id, m.r2_key, m.sha256, m.alt_text, m.moderation_status, m.created_at
     FROM media_assets m
     WHERE m.owner_id = ? AND m.upload_status = 'uploaded' AND m.purpose = 'recipe_hero'
       AND m.moderation_status IN ('pending', 'approved') AND m.sha256 IS NOT NULL
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
         WHERE assigned.media_asset_id = m.id AND assigned.id <> ?
       )
       AND NOT EXISTS (
         SELECT 1 FROM recipe_change_sets reserved
         WHERE reserved.media_asset_id = m.id AND reserved.id <> ?
           AND reserved.status IN (${ACTIVE_STATUSES})
       )
     ORDER BY CASE WHEN m.moderation_status = 'approved' THEN 0 ELSE 1 END, m.created_at DESC
     LIMIT ?`,
  ).bind(ownerId, recipeId, changeSetId, Math.min(Math.max(limit, 1), 50)).all<MediaRow & { created_at: string }>();
  return (result.results ?? []).map((item) => ({
    id: item.id,
    altText: item.alt_text,
    moderationStatus: item.moderation_status,
    previewUrl: mediaDeliveryUrl(item.r2_key, item.sha256, true),
    createdAt: item.created_at,
  }));
}

function eventStatement(database: D1Database, input: {
  changeSetId: string;
  actorId: string;
  action: "create" | "save" | "submit" | "cancel";
  previousStatus: "draft" | null;
  nextStatus: "draft" | "review" | "cancelled";
  expectedStoredRevision: number;
  reason: string | null;
}): D1PreparedStatement {
  return database.prepare(
    `INSERT INTO recipe_change_set_events (
       id, change_set_id, recipe_id, actor_id, action, previous_status, next_status,
       change_set_revision, base_recipe_revision, reason, created_at
     )
     SELECT ?, id, recipe_id, ?, ?, ?, ?, revision, base_recipe_revision, ?, CURRENT_TIMESTAMP
     FROM recipe_change_sets
     WHERE id = ? AND revision = ? AND status = ?`,
  ).bind(
    `recipe_change_event_${crypto.randomUUID()}`,
    input.actorId,
    input.action,
    input.previousStatus,
    input.nextStatus,
    input.reason,
    input.changeSetId,
    input.expectedStoredRevision,
    input.nextStatus,
  );
}

async function resolveHistoricalSource(
  database: D1Database,
  recipeId: string,
  sourceKey: string,
): Promise<HistoricalSource> {
  if (sourceKey.startsWith("revision:")) {
    const id = sourceKey.slice("revision:".length);
    if (!/^recipe_snapshot_[0-9a-f-]{36}$/i.test(id)) throw new RecipeSubmissionError("invalid", "Historical snapshot identifier is invalid.");
    const row = await database.prepare(
      `SELECT id, content_revision, source, content_json, created_at
       FROM recipe_revision_snapshots WHERE id = ? AND recipe_id = ? LIMIT 1`,
    ).bind(id, recipeId).first<{ id: string; content_revision: number; source: string; content_json: string; created_at: string }>();
    if (!row) throw new RecipeSubmissionError("invalid", "Historical recipe snapshot was not found.");
    return {
      sourceType: "revision_snapshot",
      sourceSnapshotId: row.id,
      sourceChangeSetId: null,
      sourceContentRevision: row.content_revision,
      draft: parseDraftJson(row.content_json),
      label: `Content revision ${row.content_revision} (${row.source})`,
    };
  }

  const proposedPrefix = "approved-proposed:";
  const baselinePrefix = "approved-baseline:";
  const proposed = sourceKey.startsWith(proposedPrefix);
  const baseline = sourceKey.startsWith(baselinePrefix);
  if (!proposed && !baseline) throw new RecipeSubmissionError("invalid", "Select a valid historical recipe source.");
  const id = sourceKey.slice((proposed ? proposedPrefix : baselinePrefix).length);
  if (!/^recipe_change_[0-9a-f-]{36}$/i.test(id)) throw new RecipeSubmissionError("invalid", "Historical change-set identifier is invalid.");
  const row = await database.prepare(
    `SELECT id, base_content_revision, base_content_json, content_json, promoted_at
     FROM recipe_change_sets
     WHERE id = ? AND recipe_id = ? AND status = 'approved' LIMIT 1`,
  ).bind(id, recipeId).first<{
    id: string;
    base_content_revision: number;
    base_content_json: string;
    content_json: string;
    promoted_at: string | null;
  }>();
  if (!row) throw new RecipeSubmissionError("invalid", "Approved historical change set was not found.");
  return {
    sourceType: proposed ? "approved_change_set_proposed" : "approved_change_set_baseline",
    sourceSnapshotId: null,
    sourceChangeSetId: row.id,
    sourceContentRevision: proposed ? row.base_content_revision + 1 : row.base_content_revision,
    draft: parseDraftJson(proposed ? row.content_json : row.base_content_json),
    label: proposed ? `Approved proposal content revision ${row.base_content_revision + 1}` : `Pre-approval baseline content revision ${row.base_content_revision}`,
  };
}

async function listHistoricalSources(database: D1Database, recipeId: string) {
  const [snapshots, approved] = await Promise.all([
    database.prepare(
      `SELECT id, content_revision, source, created_at
       FROM recipe_revision_snapshots WHERE recipe_id = ?
       ORDER BY content_revision DESC LIMIT 30`,
    ).bind(recipeId).all<{ id: string; content_revision: number; source: string; created_at: string }>(),
    database.prepare(
      `SELECT id, base_content_revision, resulting_recipe_revision, promoted_at, created_at
       FROM recipe_change_sets WHERE recipe_id = ? AND status = 'approved'
       ORDER BY promoted_at DESC, created_at DESC LIMIT 30`,
    ).bind(recipeId).all<{
      id: string;
      base_content_revision: number;
      resulting_recipe_revision: number | null;
      promoted_at: string | null;
      created_at: string;
    }>(),
  ]);
  const items = [
    ...(snapshots.results ?? []).map((item) => ({
      key: `revision:${item.id}`,
      kind: "recipe_revision_snapshot",
      label: `Content revision ${item.content_revision} · ${item.source}`,
      contentRevision: item.content_revision,
      createdAt: item.created_at,
    })),
    ...(approved.results ?? []).flatMap((item) => [
      {
        key: `approved-proposed:${item.id}`,
        kind: "approved_change_set_proposed",
        label: `Approved proposal · content revision ${item.base_content_revision + 1}`,
        contentRevision: item.base_content_revision + 1,
        createdAt: item.promoted_at ?? item.created_at,
      },
      {
        key: `approved-baseline:${item.id}`,
        kind: "approved_change_set_baseline",
        label: `Before approved update · content revision ${item.base_content_revision}`,
        contentRevision: item.base_content_revision,
        createdAt: item.promoted_at ?? item.created_at,
      },
    ]),
  ];
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getEditorRecipeChangeSetReadiness() {
  const submissions = getRecipeSubmissionReadiness();
  return {
    ready: submissions.ready,
    database: Boolean(getDatabase()),
    editorAuthoredChangeSets: true,
    historicalSnapshotRestore: true,
    immutableOriginAudit: true,
    contributorDraftLock: true,
    currentLiveBaseline: true,
    snapshotMediaFallback: true,
    sharedAtomicApproval: true,
  };
}

export async function isEditorControlledPublishedChangeSetDraft(changeSetId: string): Promise<boolean> {
  const database = getDatabase();
  if (!database) return false;
  const row = await database.prepare(
    `SELECT 1 AS locked
     FROM recipe_change_sets cs
     JOIN recipe_change_set_origins o ON o.change_set_id = cs.id
     WHERE cs.id = ? AND cs.status = 'draft' LIMIT 1`,
  ).bind(changeSetId).first<{ locked: number }>();
  return row?.locked === 1;
}

export async function listEditorialPublishedRecipes(limit = 100) {
  const database = getDatabase();
  if (!database) return [];
  const result = await database.prepare(
    `SELECT r.id, r.title, r.slug, r.revision, r.content_revision, r.updated_at,
            owner.display_name AS owner_name,
            cs.id AS active_change_set_id, cs.status AS active_change_set_status,
            cs.revision AS active_change_set_revision,
            o.source_type AS active_source_type,
            creator.display_name AS active_creator_name
     FROM recipes r
     JOIN users owner ON owner.id = r.author_id
     LEFT JOIN recipe_change_sets cs ON cs.recipe_id = r.id AND cs.status IN (${ACTIVE_STATUSES})
     LEFT JOIN recipe_change_set_origins o ON o.change_set_id = cs.id
     LEFT JOIN users creator ON creator.id = cs.created_by
     WHERE r.status = 'published'
     ORDER BY r.updated_at DESC, r.title ASC
     LIMIT ?`,
  ).bind(Math.min(Math.max(limit, 1), 100)).all();
  return result.results ?? [];
}

export async function getEditorPublishedRecipeChangeSetWorkspace(recipeId: string) {
  const database = getDatabase();
  if (!database) return null;
  const recipe = await findPublishedRecipe(database, recipeId);
  if (!recipe) return null;
  const [content, active, history] = await Promise.all([
    loadRecipeContent(database, recipeId),
    findActiveChangeSet(database, recipeId),
    listHistoricalSources(database, recipeId),
  ]);
  const liveDraft = toDraft(recipe, content);
  const draft = active ? parseDraftJson(active.content_json) : liveDraft;
  const mediaOptions = await listEligibleOwnerMedia(database, recipe.author_id, recipe.id, active?.id ?? "editor_new_change_set");
  const selectedMedia = mediaOptions.find((item) => item.id === draft.mediaAssetId) ?? null;
  return {
    recipe: {
      id: recipe.id,
      ownerId: recipe.author_id,
      title: recipe.title,
      slug: recipe.slug,
      revision: recipe.revision,
      contentRevision: recipe.content_revision,
    },
    active: active ? {
      id: active.id,
      status: active.status,
      revision: active.revision,
      baseRecipeRevision: active.base_recipe_revision,
      baseContentRevision: active.base_content_revision,
      contributorNote: active.contributor_note,
      editorialReason: active.editorial_reason,
      submittedAt: active.submitted_at,
      updatedAt: active.updated_at,
      editorControlled: Boolean(active.source_type),
      creatorName: active.creator_name,
      creatorRole: active.creator_role,
      origin: active.source_type ? {
        sourceType: active.source_type,
        sourceSnapshotId: active.source_snapshot_id,
        sourceChangeSetId: active.source_change_set_id,
        sourceContentRevision: active.source_content_revision,
        mediaFallbackApplied: active.media_fallback_applied === 1,
      } : null,
    } : null,
    draft,
    liveDraft,
    selectedMedia,
    mediaOptions,
    history,
  };
}

export async function startEditorPublishedRecipeChangeSet(input: {
  recipeId: string;
  actorId: string;
  historicalSourceKey?: string;
}) {
  if (!getRecipeSubmissionReadiness().ready) throw new RecipeSubmissionError("unavailable", "Editor-authored recipe change sets are not ready.");
  const database = getDatabase()!;
  const recipe = await findPublishedRecipe(database, input.recipeId);
  if (!recipe) throw new RecipeSubmissionError("invalid", "Published recipe was not found.");
  const existing = await findActiveChangeSet(database, input.recipeId);
  if (existing) return { id: existing.id, status: existing.status, revision: existing.revision, existing: true, editorControlled: Boolean(existing.source_type) };

  const content = await loadRecipeContent(database, recipe.id);
  const liveDraft = toDraft(recipe, content);
  const baselineJson = JSON.stringify(liveDraft);
  const historical = input.historicalSourceKey
    ? await resolveHistoricalSource(database, recipe.id, input.historicalSourceKey)
    : {
      sourceType: "editor_current" as const,
      sourceSnapshotId: null,
      sourceChangeSetId: null,
      sourceContentRevision: recipe.content_revision,
      draft: liveDraft,
      label: "Current published recipe",
    };
  await resolveCategories(database, historical.draft.categories);

  const changeSetId = `recipe_change_${crypto.randomUUID()}`;
  let selectedMedia: MediaRow | null = null;
  if (historical.draft.mediaAssetId) {
    selectedMedia = await findEligibleOwnerMedia({
      database,
      ownerId: recipe.author_id,
      recipeId: recipe.id,
      changeSetId,
      mediaAssetId: historical.draft.mediaAssetId,
    });
  }
  let mediaFallbackApplied = false;
  if (!selectedMedia && recipe.media_asset_id) {
    selectedMedia = await findEligibleOwnerMedia({
      database,
      ownerId: recipe.author_id,
      recipeId: recipe.id,
      changeSetId,
      mediaAssetId: recipe.media_asset_id,
    });
    mediaFallbackApplied = historical.sourceType !== "editor_current";
  }
  if (historical.sourceType !== "editor_current" && historical.draft.mediaAssetId !== selectedMedia?.id) {
    mediaFallbackApplied = true;
  }
  const proposedDraft: RecipeDraft = { ...historical.draft, mediaAssetId: selectedMedia?.id ?? null };
  const proposedJson = JSON.stringify(proposedDraft);
  if (baselineJson.length > 100000 || proposedJson.length > 100000) {
    throw new RecipeSubmissionError("invalid", "Recipe content is too large for a private change set.");
  }
  const reason = input.historicalSourceKey
    ? `Editor restored ${historical.label} into a new private change set.${mediaFallbackApplied ? " Historical media was unavailable, so a current eligible media fallback was applied." : ""}`
    : "Editor created a private change set from the current published recipe.";

  try {
    const results = await database.batch([
      database.prepare(
        `INSERT INTO recipe_change_sets (
           id, recipe_id, owner_id, created_by, status, revision,
           base_recipe_revision, base_content_revision, media_asset_id,
           base_content_json, content_json, contributor_note, created_at, updated_at
         )
         SELECT ?, r.id, r.author_id, ?, 'draft', 1, r.revision, r.content_revision,
                ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         FROM recipes r
         WHERE r.id = ? AND r.status = 'published' AND r.revision = ? AND r.content_revision = ?
           AND NOT EXISTS (
             SELECT 1 FROM recipe_change_sets active
             WHERE active.recipe_id = r.id AND active.status IN (${ACTIVE_STATUSES})
           )`,
      ).bind(
        changeSetId,
        input.actorId,
        selectedMedia?.id ?? null,
        baselineJson,
        proposedJson,
        reason,
        recipe.id,
        recipe.revision,
        recipe.content_revision,
      ),
      database.prepare(
        `INSERT INTO recipe_change_set_origins (
           change_set_id, source_type, source_snapshot_id, source_change_set_id,
           source_content_revision, media_fallback_applied, created_by, created_at
         )
         SELECT id, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
         FROM recipe_change_sets WHERE id = ? AND status = 'draft' AND revision = 1`,
      ).bind(
        historical.sourceType,
        historical.sourceSnapshotId,
        historical.sourceChangeSetId,
        historical.sourceContentRevision,
        mediaFallbackApplied ? 1 : 0,
        input.actorId,
        changeSetId,
      ),
      eventStatement(database, {
        changeSetId,
        actorId: input.actorId,
        action: "create",
        previousStatus: null,
        nextStatus: "draft",
        expectedStoredRevision: 1,
        reason,
      }),
    ]);
    if (!results.every((result) => result.success) || (results[0]?.meta.changes ?? 0) !== 1 || (results[1]?.meta.changes ?? 0) !== 1) {
      throw new RecipeSubmissionError("conflict", "The published recipe changed or another active change set was created concurrently.");
    }
  } catch (error) {
    if (error instanceof RecipeSubmissionError) throw error;
    throw new RecipeSubmissionError("conflict", "The editor-authored change set could not be created safely.");
  }
  return { id: changeSetId, status: "draft" as const, revision: 1, existing: false, editorControlled: true, mediaFallbackApplied };
}

export async function saveEditorPublishedRecipeChangeSet(input: {
  recipeId: string;
  changeSetId: string;
  actorId: string;
  expectedRevision: number;
  draft: RecipeDraft;
  note?: string;
  submit: boolean;
}) {
  if (!getRecipeSubmissionReadiness().ready) throw new RecipeSubmissionError("unavailable", "Editor-authored recipe change sets are not ready.");
  const database = getDatabase()!;
  const current = await database.prepare(
    `SELECT cs.* FROM recipe_change_sets cs
     JOIN recipe_change_set_origins o ON o.change_set_id = cs.id
     WHERE cs.id = ? AND cs.recipe_id = ? AND cs.status = 'draft' AND cs.revision = ?
     LIMIT 1`,
  ).bind(input.changeSetId, input.recipeId, input.expectedRevision).first<ActiveChangeSetRow>();
  if (!current) throw new RecipeSubmissionError("conflict", "This editor-authored draft changed or is no longer editable.");
  const live = await findPublishedRecipe(database, input.recipeId);
  if (!live || live.author_id !== current.owner_id || live.revision !== current.base_recipe_revision || live.content_revision !== current.base_content_revision) {
    throw new RecipeSubmissionError("conflict", "The live published recipe changed after this editorial draft was created.");
  }
  const categories = await resolveCategories(database, input.draft.categories);
  if (!categories.length) throw new RecipeSubmissionError("invalid", "Select at least one valid category.");
  let media: MediaRow | null = null;
  if (input.draft.mediaAssetId) {
    media = await findEligibleOwnerMedia({
      database,
      ownerId: current.owner_id,
      recipeId: current.recipe_id,
      changeSetId: current.id,
      mediaAssetId: input.draft.mediaAssetId,
    });
    if (!media) throw new RecipeSubmissionError("invalid", "Select eligible owner media with complete privacy-safe derivatives.");
  }
  if (input.submit && !media) throw new RecipeSubmissionError("invalid", "Attach eligible owner media before submitting the editorial proposal.");
  const contentJson = JSON.stringify({ ...input.draft, mediaAssetId: media?.id ?? null });
  if (contentJson.length > 100000) throw new RecipeSubmissionError("invalid", "Recipe change-set content is too large.");
  const nextStatus = input.submit ? "review" as const : "draft" as const;
  const nextRevision = input.expectedRevision + 1;
  const note = cleanNote(input.note, input.submit ? "Editor submitted the private proposal for review." : "Editor saved the private proposal.");
  const results = await database.batch([
    database.prepare(
      `UPDATE recipe_change_sets
       SET content_json = ?, media_asset_id = ?, contributor_note = ?, status = ?,
           revision = revision + 1,
           submitted_at = CASE WHEN ? = 'review' THEN CURRENT_TIMESTAMP ELSE submitted_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND recipe_id = ? AND status = 'draft' AND revision = ?
         AND base_recipe_revision = ? AND base_content_revision = ?
         AND EXISTS (SELECT 1 FROM recipe_change_set_origins o WHERE o.change_set_id = recipe_change_sets.id)
         AND EXISTS (
           SELECT 1 FROM recipes r
           WHERE r.id = recipe_change_sets.recipe_id AND r.status = 'published'
             AND r.revision = recipe_change_sets.base_recipe_revision
             AND r.content_revision = recipe_change_sets.base_content_revision
         )`,
    ).bind(
      contentJson,
      media?.id ?? null,
      note,
      nextStatus,
      nextStatus,
      current.id,
      current.recipe_id,
      input.expectedRevision,
      current.base_recipe_revision,
      current.base_content_revision,
    ),
    eventStatement(database, {
      changeSetId: current.id,
      actorId: input.actorId,
      action: input.submit ? "submit" : "save",
      previousStatus: "draft",
      nextStatus,
      expectedStoredRevision: nextRevision,
      reason: note,
    }),
  ]);
  if (!results.every((result) => result.success) || (results[0]?.meta.changes ?? 0) !== 1) {
    throw new RecipeSubmissionError("conflict", "The editorial draft or live recipe changed concurrently.");
  }
  return { id: current.id, status: nextStatus, revision: nextRevision, mediaModerationStatus: media?.moderation_status ?? null };
}

export async function cancelEditorPublishedRecipeChangeSet(input: {
  recipeId: string;
  changeSetId: string;
  actorId: string;
  expectedRevision: number;
  reason?: string;
}) {
  const database = getDatabase();
  if (!database) throw new RecipeSubmissionError("unavailable", "Editor-authored recipe change sets are unavailable.");
  const reason = cleanNote(input.reason, "Editor cancelled the private draft.");
  const nextRevision = input.expectedRevision + 1;
  const results = await database.batch([
    database.prepare(
      `UPDATE recipe_change_sets
       SET status = 'cancelled', revision = revision + 1, editorial_reason = ?,
           reviewed_at = CURRENT_TIMESTAMP, cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND recipe_id = ? AND status = 'draft' AND revision = ?
         AND EXISTS (SELECT 1 FROM recipe_change_set_origins o WHERE o.change_set_id = recipe_change_sets.id)`,
    ).bind(reason, input.changeSetId, input.recipeId, input.expectedRevision),
    eventStatement(database, {
      changeSetId: input.changeSetId,
      actorId: input.actorId,
      action: "cancel",
      previousStatus: "draft",
      nextStatus: "cancelled",
      expectedStoredRevision: nextRevision,
      reason,
    }),
  ]);
  if (!results.every((result) => result.success) || (results[0]?.meta.changes ?? 0) !== 1) {
    throw new RecipeSubmissionError("conflict", "The editorial draft changed or is no longer cancellable.");
  }
  return { id: input.changeSetId, status: "cancelled" as const, revision: nextRevision };
}
