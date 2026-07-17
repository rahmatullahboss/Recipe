import { env } from "cloudflare:workers";
import { MEDIA_DERIVATIVE_POLICY_VERSION } from "./media-policy";
import { validateRecipeDraft, type RecipeDraft } from "./recipe-draft";
import { getRecipeSubmissionReadiness, RecipeSubmissionError } from "./recipe-submissions";

export const RECIPE_THREE_WAY_STRATEGY_VERSION = "recipe-three-way-v1";

export type RecipeConflictUnitKey =
  | "title"
  | "summary"
  | "description"
  | "mediaAssetId"
  | "countryCode"
  | "languageCode"
  | "measurementSystem"
  | "prepMinutes"
  | "cookMinutes"
  | "servings"
  | "difficulty"
  | "categories"
  | "ingredients"
  | "steps";

export type RecipeConflictState =
  | "unchanged"
  | "proposal_only"
  | "live_only"
  | "same_change"
  | "conflict";

export type RecipeConflictChoice = "live" | "proposed";

type Bindings = { DB?: D1Database };
type Actor = { id: string; role: string };
type IngredientRow = { item: string; amount: string | null; unit: string | null; note: string | null };
type StepRow = { instruction: string; timer_seconds: number | null };
type CategorySlugRow = { slug: string };
type LiveRecipeRow = {
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
  status: string;
  revision: number;
  content_revision: number;
  slug: string;
};
type ConflictRow = {
  id: string;
  recipe_id: string;
  owner_id: string;
  created_by: string;
  status: string;
  revision: number;
  base_recipe_revision: number;
  base_content_revision: number;
  media_asset_id: string | null;
  base_content_json: string;
  content_json: string;
  contributor_note: string | null;
  editorial_reason: string | null;
  source_type: string | null;
  owner_name: string;
  creator_name: string;
} & LiveRecipeRow;

const bindings = env as unknown as Bindings;
const UNIT_ORDER: RecipeConflictUnitKey[] = [
  "title",
  "summary",
  "description",
  "mediaAssetId",
  "countryCode",
  "languageCode",
  "measurementSystem",
  "prepMinutes",
  "cookMinutes",
  "servings",
  "difficulty",
  "categories",
  "ingredients",
  "steps",
];
const UNIT_LABELS: Record<RecipeConflictUnitKey, string> = {
  title: "Title",
  summary: "Summary",
  description: "Description",
  mediaAssetId: "Hero image",
  countryCode: "Market",
  languageCode: "Language",
  measurementSystem: "Measurement system",
  prepMinutes: "Preparation time",
  cookMinutes: "Cooking time",
  servings: "Servings",
  difficulty: "Difficulty",
  categories: "Categories",
  ingredients: "Ingredient list",
  steps: "Directions",
};

function getDatabase(): D1Database | undefined {
  return bindings.DB;
}

function parseDraftJson(value: string, label: string): RecipeDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new RecipeSubmissionError("unavailable", `${label} recipe JSON is invalid.`);
  }
  const validation = validateRecipeDraft(parsed);
  if (!validation.valid || !validation.draft) {
    throw new RecipeSubmissionError("unavailable", `${label} recipe JSON no longer passes canonical validation.`);
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

function toDraft(recipe: LiveRecipeRow, content: Awaited<ReturnType<typeof loadRecipeContent>>): RecipeDraft {
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

function comparableValue(draft: RecipeDraft, key: RecipeConflictUnitKey): unknown {
  const value = draft[key];
  if (key === "categories") return [...(value as string[])].sort();
  return value;
}

function equalValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function buildRecipeChangeSetThreeWay(
  baseline: RecipeDraft,
  live: RecipeDraft,
  proposed: RecipeDraft,
) {
  const units = UNIT_ORDER.map((key) => {
    const baseValue = comparableValue(baseline, key);
    const liveValue = comparableValue(live, key);
    const proposedValue = comparableValue(proposed, key);
    const liveChanged = !equalValue(liveValue, baseValue);
    const proposalChanged = !equalValue(proposedValue, baseValue);
    let state: RecipeConflictState;
    if (!liveChanged && !proposalChanged) state = "unchanged";
    else if (!liveChanged && proposalChanged) state = "proposal_only";
    else if (liveChanged && !proposalChanged) state = "live_only";
    else if (equalValue(liveValue, proposedValue)) state = "same_change";
    else state = "conflict";
    return {
      key,
      label: UNIT_LABELS[key],
      state,
      baseline: cloneValue(baseline[key]),
      live: cloneValue(live[key]),
      proposed: cloneValue(proposed[key]),
    };
  });
  const count = (state: RecipeConflictState) => units.filter((unit) => unit.state === state).length;
  return {
    strategyVersion: RECIPE_THREE_WAY_STRATEGY_VERSION,
    units,
    summary: {
      unchanged: count("unchanged"),
      proposalOnly: count("proposal_only"),
      liveOnly: count("live_only"),
      sameChange: count("same_change"),
      conflicts: count("conflict"),
    },
  };
}

function mergeThreeWayDraft(
  live: RecipeDraft,
  proposed: RecipeDraft,
  comparison: ReturnType<typeof buildRecipeChangeSetThreeWay>,
  resolutions: Partial<Record<RecipeConflictUnitKey, RecipeConflictChoice>>,
): RecipeDraft {
  const merged = cloneValue(live) as Record<string, unknown>;
  for (const unit of comparison.units) {
    if (unit.state === "proposal_only") merged[unit.key] = cloneValue(proposed[unit.key]);
    else if (unit.state === "conflict") {
      const choice = resolutions[unit.key];
      if (choice !== "live" && choice !== "proposed") {
        throw new RecipeSubmissionError("invalid", `Choose the live or proposed value for ${unit.label}.`);
      }
      merged[unit.key] = cloneValue(choice === "proposed" ? proposed[unit.key] : live[unit.key]);
    } else {
      merged[unit.key] = cloneValue(live[unit.key]);
    }
  }
  const validation = validateRecipeDraft(merged);
  if (!validation.valid || !validation.draft) {
    throw new RecipeSubmissionError("invalid", "The resolved private recipe no longer passes canonical validation.");
  }
  return validation.draft;
}

async function loadConflictRow(database: D1Database, changeSetId: string): Promise<ConflictRow | null> {
  return database.prepare(
    `SELECT cs.id, cs.recipe_id, cs.owner_id, cs.created_by, cs.status, cs.revision,
            cs.base_recipe_revision, cs.base_content_revision, cs.media_asset_id,
            cs.base_content_json, cs.content_json, cs.contributor_note, cs.editorial_reason,
            o.source_type, owner.display_name AS owner_name, creator.display_name AS creator_name,
            r.id, r.author_id, r.title, r.summary, r.description, r.media_asset_id,
            r.country_code, r.language_code, r.measurement_system, r.prep_minutes,
            r.cook_minutes, r.servings, r.difficulty, r.status, r.revision,
            r.content_revision, r.slug
     FROM recipe_change_sets cs
     JOIN recipes r ON r.id = cs.recipe_id
     JOIN users owner ON owner.id = cs.owner_id
     JOIN users creator ON creator.id = cs.created_by
     LEFT JOIN recipe_change_set_origins o ON o.change_set_id = cs.id
     WHERE cs.id = ? LIMIT 1`,
  ).bind(changeSetId).first<ConflictRow>();
}

function canView(row: ConflictRow, actor: Actor): boolean {
  return row.owner_id === actor.id || actor.role === "editor" || actor.role === "admin";
}

function controlMode(row: ConflictRow, actor: Actor): "contributor" | "editor" | null {
  if (row.status === "changes_requested" && row.owner_id === actor.id) return "contributor";
  if (row.status !== "draft") return null;
  if (!row.source_type && row.owner_id === actor.id) return "contributor";
  if (row.source_type && (actor.role === "editor" || actor.role === "admin")) return "editor";
  return null;
}

export async function getRecipeChangeSetConflictContext(changeSetId: string, actor: Actor) {
  const database = getDatabase();
  if (!database) return null;
  const row = await loadConflictRow(database, changeSetId);
  if (!row || !canView(row, actor)) return null;
  const content = await loadRecipeContent(database, row.recipe_id);
  const baseline = parseDraftJson(row.base_content_json, "Stored baseline");
  const proposed = parseDraftJson(row.content_json, "Stored proposal");
  const live = toDraft(row, content);
  const comparison = buildRecipeChangeSetThreeWay(baseline, live, proposed);
  const rebases = await database.prepare(
    `SELECT rb.id, rb.actor_id, rb.previous_change_set_revision, rb.resulting_change_set_revision,
            rb.previous_base_recipe_revision, rb.previous_base_content_revision,
            rb.resulting_base_recipe_revision, rb.resulting_base_content_revision,
            rb.proposal_only_count, rb.live_only_count, rb.same_change_count, rb.conflict_count,
            rb.resolution_json, rb.created_at, u.display_name AS actor_name
     FROM recipe_change_set_rebases rb JOIN users u ON u.id = rb.actor_id
     WHERE rb.change_set_id = ? ORDER BY rb.created_at DESC`,
  ).bind(changeSetId).all();
  const stale = row.status !== "published"
    ? row.revision !== row.base_recipe_revision || row.content_revision !== row.base_content_revision || row.status !== "published"
    : false;
  const livePublished = row.status === "published";
  const baseStale = !livePublished
    || row.revision !== row.base_recipe_revision
    || row.content_revision !== row.base_content_revision;
  return {
    changeSet: {
      id: row.id,
      recipeId: row.recipe_id,
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      creatorName: row.creator_name,
      sourceType: row.source_type,
      status: row.status,
      revision: row.revision,
      baseRecipeRevision: row.base_recipe_revision,
      baseContentRevision: row.base_content_revision,
      liveRecipeRevision: row.revision,
      liveContentRevision: row.content_revision,
      liveStatus: row.status,
      slug: row.slug,
      title: row.title,
      contributorNote: row.contributor_note,
      editorialReason: row.editorial_reason,
    },
    baseline,
    live,
    proposed,
    comparison,
    baseStale,
    stale,
    controlMode: controlMode(row, actor),
    canRequestResolution: (actor.role === "editor" || actor.role === "admin") && row.status === "review",
    rebases: rebases.results ?? [],
  };
}

async function resolveCategories(database: D1Database, slugs: string[]): Promise<void> {
  const placeholders = slugs.map(() => "?").join(", ");
  const result = await database.prepare(
    `SELECT slug FROM categories WHERE slug IN (${placeholders})`,
  ).bind(...slugs).all<{ slug: string }>();
  const found = new Set((result.results ?? []).map((item) => item.slug));
  const missing = slugs.filter((slug) => !found.has(slug));
  if (missing.length) throw new RecipeSubmissionError("invalid", `Unknown categories: ${missing.join(", ")}.`);
}

async function requireEligibleMedia(input: {
  database: D1Database;
  mediaAssetId: string | null;
  ownerId: string;
  recipeId: string;
  changeSetId: string;
}) {
  if (!input.mediaAssetId) throw new RecipeSubmissionError("invalid", "The resolved private recipe requires an eligible hero image.");
  const media = await input.database.prepare(
    `SELECT m.id FROM media_assets m
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
           AND reserved.status IN ('draft', 'review', 'changes_requested')
       )
     LIMIT 1`,
  ).bind(input.mediaAssetId, input.ownerId, input.recipeId, input.changeSetId).first<{ id: string }>();
  if (!media) {
    throw new RecipeSubmissionError("invalid", "The resolved hero image is no longer eligible or is reserved elsewhere.");
  }
}

export async function rebaseRecipeChangeSet(input: {
  changeSetId: string;
  actor: Actor;
  expectedRevision: number;
  resolutions: Partial<Record<RecipeConflictUnitKey, RecipeConflictChoice>>;
}) {
  if (!getRecipeSubmissionReadiness().ready) {
    throw new RecipeSubmissionError("unavailable", "Recipe change-set rebasing is not ready.");
  }
  const database = getDatabase()!;
  const row = await loadConflictRow(database, input.changeSetId);
  if (!row || !canView(row, input.actor)) throw new RecipeSubmissionError("forbidden", "This private change set is unavailable.");
  if (row.revision !== input.expectedRevision) throw new RecipeSubmissionError("conflict", "The private change set changed after the conflict view opened.");
  const mode = controlMode(row, input.actor);
  if (!mode) throw new RecipeSubmissionError("forbidden", "This change set is not currently controlled by your account.");
  if (row.status !== "published") {
    throw new RecipeSubmissionError("conflict", "The live recipe must remain published before a private rebase can occur.");
  }
  if (row.revision === row.base_recipe_revision && row.content_revision === row.base_content_revision) {
    throw new RecipeSubmissionError("invalid", "This private change set is already based on the current live recipe.");
  }

  const content = await loadRecipeContent(database, row.recipe_id);
  const baseline = parseDraftJson(row.base_content_json, "Stored baseline");
  const proposed = parseDraftJson(row.content_json, "Stored proposal");
  const live = toDraft(row, content);
  const comparison = buildRecipeChangeSetThreeWay(baseline, live, proposed);
  const conflictKeys = new Set(comparison.units.filter((unit) => unit.state === "conflict").map((unit) => unit.key));
  for (const [key, value] of Object.entries(input.resolutions)) {
    if (!conflictKeys.has(key as RecipeConflictUnitKey) || (value !== "live" && value !== "proposed")) {
      throw new RecipeSubmissionError("invalid", "Conflict choices may be supplied only for fields that changed differently.");
    }
  }
  const merged = mergeThreeWayDraft(live, proposed, comparison, input.resolutions);
  await Promise.all([
    resolveCategories(database, merged.categories),
    requireEligibleMedia({
      database,
      mediaAssetId: merged.mediaAssetId,
      ownerId: row.owner_id,
      recipeId: row.recipe_id,
      changeSetId: row.id,
    }),
  ]);

  const liveJson = JSON.stringify(live);
  const mergedJson = JSON.stringify(merged);
  const resolutionJson = JSON.stringify({
    strategyVersion: RECIPE_THREE_WAY_STRATEGY_VERSION,
    choices: input.resolutions,
    units: comparison.units.map((unit) => ({ key: unit.key, state: unit.state })),
  });
  if ([liveJson, mergedJson, row.base_content_json, row.content_json].some((value) => value.length > 100000)) {
    throw new RecipeSubmissionError("invalid", "The recipe content is too large for an audited rebase.");
  }
  if (resolutionJson.length > 20000) throw new RecipeSubmissionError("invalid", "The conflict resolution record is too large.");

  const nextRevision = row.revision + 1;
  const controlSql = mode === "contributor"
    ? `AND owner_id = ? AND (status = 'changes_requested' OR NOT EXISTS (
         SELECT 1 FROM recipe_change_set_origins o WHERE o.change_set_id = recipe_change_sets.id
       ))`
    : `AND status = 'draft' AND EXISTS (
         SELECT 1 FROM recipe_change_set_origins o WHERE o.change_set_id = recipe_change_sets.id
       )`;
  const controlBindings = mode === "contributor" ? [input.actor.id] : [];
  const update = database.prepare(
    `UPDATE recipe_change_sets
     SET base_recipe_revision = ?, base_content_revision = ?, base_content_json = ?,
         content_json = ?, media_asset_id = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND revision = ? AND status IN ('draft', 'changes_requested')
       AND base_recipe_revision = ? AND base_content_revision = ?
       ${controlSql}
       AND EXISTS (
         SELECT 1 FROM recipes r
         WHERE r.id = recipe_change_sets.recipe_id AND r.author_id = recipe_change_sets.owner_id
           AND r.status = 'published' AND r.revision = ? AND r.content_revision = ?
       )`,
  ).bind(
    row.revision,
    row.content_revision,
    liveJson,
    mergedJson,
    merged.mediaAssetId,
    row.id,
    input.expectedRevision,
    row.base_recipe_revision,
    row.base_content_revision,
    ...controlBindings,
    row.revision,
    row.content_revision,
  );
  const audit = database.prepare(
    `INSERT INTO recipe_change_set_rebases (
       id, change_set_id, recipe_id, actor_id, strategy_version,
       previous_change_set_revision, resulting_change_set_revision,
       previous_base_recipe_revision, previous_base_content_revision,
       resulting_base_recipe_revision, resulting_base_content_revision,
       proposal_only_count, live_only_count, same_change_count, conflict_count,
       resolution_json, previous_base_content_json, live_content_json,
       previous_proposed_content_json, resulting_proposed_content_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
  ).bind(
    `recipe_rebase_${crypto.randomUUID()}`,
    row.id,
    row.recipe_id,
    input.actor.id,
    RECIPE_THREE_WAY_STRATEGY_VERSION,
    row.revision,
    nextRevision,
    row.base_recipe_revision,
    row.base_content_revision,
    row.revision,
    row.content_revision,
    comparison.summary.proposalOnly,
    comparison.summary.liveOnly,
    comparison.summary.sameChange,
    comparison.summary.conflicts,
    resolutionJson,
    row.base_content_json,
    liveJson,
    row.content_json,
    mergedJson,
  );

  try {
    const results = await database.batch([update, audit]);
    if (!results.every((result) => result.success) || (results[0]?.meta.changes ?? 0) !== 1 || (results[1]?.meta.changes ?? 0) !== 1) {
      throw new RecipeSubmissionError("conflict", "The live recipe or private change set changed during rebase.");
    }
  } catch (error) {
    if (error instanceof RecipeSubmissionError) throw error;
    throw new RecipeSubmissionError("conflict", "The live recipe or private change set changed during rebase.");
  }

  return {
    id: row.id,
    status: row.status,
    revision: nextRevision,
    baseRecipeRevision: row.revision,
    baseContentRevision: row.content_revision,
    summary: comparison.summary,
  };
}

export async function requestRecipeChangeSetConflictResolution(input: {
  changeSetId: string;
  actorId: string;
  expectedRevision: number;
  reason?: string;
}) {
  const reason = input.reason?.trim().replace(/\s+/g, " ").slice(0, 1000) ?? "";
  if (reason.length < 10) throw new RecipeSubmissionError("invalid", "Describe the required conflict resolution with at least 10 characters.");
  const database = getDatabase();
  if (!database) throw new RecipeSubmissionError("unavailable", "Published recipe change sets are unavailable.");
  const nextRevision = input.expectedRevision + 1;
  const results = await database.batch([
    database.prepare(
      `UPDATE recipe_change_sets
       SET status = 'changes_requested', revision = revision + 1,
           editorial_reason = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'review' AND revision = ?`,
    ).bind(reason, input.changeSetId, input.expectedRevision),
    database.prepare(
      `INSERT INTO recipe_change_set_events (
         id, change_set_id, recipe_id, actor_id, action, previous_status, next_status,
         change_set_revision, base_recipe_revision, reason, created_at
       )
       SELECT ?, id, recipe_id, ?, 'request_changes', 'review', 'changes_requested',
              revision, base_recipe_revision, ?, CURRENT_TIMESTAMP
       FROM recipe_change_sets
       WHERE id = ? AND status = 'changes_requested' AND revision = ?`,
    ).bind(
      `recipe_change_event_${crypto.randomUUID()}`,
      input.actorId,
      reason,
      input.changeSetId,
      nextRevision,
    ),
  ]);
  if (!results.every((result) => result.success) || (results[0]?.meta.changes ?? 0) !== 1 || (results[1]?.meta.changes ?? 0) !== 1) {
    throw new RecipeSubmissionError("conflict", "The private change set changed concurrently.");
  }
  return { id: input.changeSetId, status: "changes_requested" as const, revision: nextRevision };
}

export function getRecipeChangeSetConflictReadiness() {
  return {
    threeWayComparison: true,
    atomicCollectionUnits: true,
    explicitConflictChoices: true,
    privateRebaseOnly: true,
    immutableRebaseAudit: true,
    staleApprovalStillBlocked: true,
    reviewerConflictHandoff: true,
  };
}
