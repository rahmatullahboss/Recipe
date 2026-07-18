import { env } from "cloudflare:workers";
import { MEDIA_DERIVATIVE_POLICY_VERSION } from "./media-policy";
import { getRecipeSubmissionReadiness, RecipeSubmissionError } from "./recipe-submissions";

export type RecipePublicationAction =
  | "publish"
  | "schedule"
  | "cancel_schedule"
  | "archive"
  | "restore";

type PublicationBindings = { DB?: D1Database };
type PublicationRecipeRow = {
  id: string;
  status: "draft" | "review" | "published" | "archived";
  revision: number;
  media_asset_id: string | null;
  media_status: string | null;
  derivative_ready: number;
  ingredient_count: number;
  step_count: number;
  category_count: number;
  scheduled_publish_at: string | null;
  schedule_revision: number | null;
};

type DueScheduleRow = {
  id: string;
  revision: number;
  scheduled_publish_at: string;
};

const bindings = env as unknown as PublicationBindings;
const MINIMUM_SCHEDULE_DELAY_MS = 5 * 60 * 1000;
const MAXIMUM_SCHEDULE_DELAY_MS = 366 * 24 * 60 * 60 * 1000;

function getDatabase(): D1Database | undefined {
  return bindings.DB;
}

function cleanReason(value: string | undefined, fallback: string | null = null): string | null {
  const reason = value?.trim().replace(/\s+/g, " ").slice(0, 1000) ?? "";
  return reason || fallback;
}

function toSqlTimestamp(value: string | undefined): string {
  const date = new Date(value ?? "");
  const timestamp = date.getTime();
  const now = Date.now();
  if (!Number.isFinite(timestamp)) {
    throw new RecipeSubmissionError("invalid", "Choose a valid UTC publication date and time.");
  }
  if (timestamp < now + MINIMUM_SCHEDULE_DELAY_MS) {
    throw new RecipeSubmissionError("invalid", "Scheduled publication must be at least five minutes in the future.");
  }
  if (timestamp > now + MAXIMUM_SCHEDULE_DELAY_MS) {
    throw new RecipeSubmissionError("invalid", "Scheduled publication cannot be more than one year in the future.");
  }
  return new Date(timestamp).toISOString().slice(0, 19).replace("T", " ");
}

async function publicationCheck(database: D1Database, recipeId: string): Promise<PublicationRecipeRow | null> {
  return database.prepare(
    `SELECT r.id, r.status, r.revision, r.media_asset_id,
            r.scheduled_publish_at, r.schedule_revision,
            m.moderation_status AS media_status,
            EXISTS (
              SELECT 1 FROM media_derivative_jobs j
              WHERE j.media_id = m.id
                AND j.status = 'ready'
                AND j.policy_version = '${MEDIA_DERIVATIVE_POLICY_VERSION}'
                AND j.source_sha256 = m.sha256
                AND j.required_variant_count > 0
                AND j.ready_variant_count >= j.required_variant_count
            ) AS derivative_ready,
            (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.recipe_id = r.id) AS ingredient_count,
            (SELECT COUNT(*) FROM recipe_steps rs WHERE rs.recipe_id = r.id) AS step_count,
            (SELECT COUNT(*) FROM recipe_categories rc WHERE rc.recipe_id = r.id) AS category_count
     FROM recipes r
     LEFT JOIN media_assets m ON m.id = r.media_asset_id AND m.upload_status = 'uploaded'
     WHERE r.id = ?
     LIMIT 1`,
  ).bind(recipeId).first<PublicationRecipeRow>();
}

function assertExpectedRevision(current: PublicationRecipeRow, expectedRevision: number): void {
  if (current.revision !== expectedRevision) {
    throw new RecipeSubmissionError("conflict", "This recipe changed after the editorial page was loaded.");
  }
}

function assertPublicationReady(current: PublicationRecipeRow): void {
  if (!current.media_asset_id || current.media_status !== "approved" || current.derivative_ready !== 1) {
    throw new RecipeSubmissionError(
      "invalid",
      "Approve the attached hero image and complete its privacy-safe derivatives before publishing or scheduling this recipe.",
    );
  }
  if (current.ingredient_count < 2 || current.step_count < 2 || current.category_count < 1) {
    throw new RecipeSubmissionError("invalid", "Recipe content is incomplete and cannot be published or scheduled.");
  }
}

function publicationEventStatement(
  database: D1Database,
  input: {
    recipeId: string;
    actorId: string;
    action: Exclude<RecipePublicationAction, "publish"> | "published_now" | "scheduled_published";
    expectedRevision: number;
    resultingRevision: number;
    scheduledPublishAt: string | null;
    reason: string | null;
  },
): D1PreparedStatement {
  return database.prepare(
    `INSERT INTO recipe_publication_events (
       id, recipe_id, actor_id, action, expected_revision, resulting_revision,
       scheduled_publish_at, reason, created_at
     )
     SELECT ?, id, ?, ?, ?, revision, ?, ?, CURRENT_TIMESTAMP
     FROM recipes
     WHERE id = ? AND revision = ?`,
  ).bind(
    `publication_event_${crypto.randomUUID()}`,
    input.actorId,
    input.action,
    input.expectedRevision,
    input.scheduledPublishAt,
    input.reason,
    input.recipeId,
    input.resultingRevision,
  );
}

function publicationGateSql(): string {
  return `
    AND (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.recipe_id = recipes.id) >= 2
    AND (SELECT COUNT(*) FROM recipe_steps rs WHERE rs.recipe_id = recipes.id) >= 2
    AND (SELECT COUNT(*) FROM recipe_categories rc WHERE rc.recipe_id = recipes.id) >= 1
    AND EXISTS (
      SELECT 1
      FROM media_assets m
      WHERE m.id = recipes.media_asset_id
        AND m.upload_status = 'uploaded'
        AND m.moderation_status = 'approved'
        AND EXISTS (
          SELECT 1 FROM media_derivative_jobs j
          WHERE j.media_id = m.id
            AND j.status = 'ready'
            AND j.policy_version = '${MEDIA_DERIVATIVE_POLICY_VERSION}'
            AND j.source_sha256 = m.sha256
            AND j.required_variant_count > 0
            AND j.ready_variant_count >= j.required_variant_count
        )
    )`;
}

export function getRecipePublicationWorkflowReadiness() {
  const submissions = getRecipeSubmissionReadiness();
  return {
    ready: submissions.ready,
    database: Boolean(getDatabase()),
    scheduledPublishing: true,
    guardedManualProcessor: true,
    archiveRestore: true,
    revisionGuard: true,
    mediaRevalidation: true,
    atomicPromotion: true,
    automaticCronConfigured: false,
  };
}

export async function publishRecipeNow(input: {
  recipeId: string;
  actorId: string;
  expectedRevision: number;
  reason?: string;
}) {
  if (!getRecipeSubmissionReadiness().ready) {
    throw new RecipeSubmissionError("unavailable", "Recipe publication is not ready.");
  }
  const database = getDatabase()!;
  const current = await publicationCheck(database, input.recipeId);
  if (!current) throw new RecipeSubmissionError("invalid", "Recipe submission was not found.");
  if (current.status !== "review") throw new RecipeSubmissionError("conflict", "This recipe is no longer awaiting review.");
  assertExpectedRevision(current, input.expectedRevision);
  assertPublicationReady(current);

  const reason = cleanReason(input.reason, "Published after editorial review.");
  const nextRevision = input.expectedRevision + 1;
  const results = await database.batch([
    database.prepare(
      `UPDATE recipes
       SET status = 'published',
           revision = revision + 1,
           editorial_actor_id = ?,
           editorial_reason = ?,
           reviewed_at = CURRENT_TIMESTAMP,
           published_at = CURRENT_TIMESTAMP,
           scheduled_publish_at = NULL,
           scheduled_by = NULL,
           schedule_revision = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'review' AND revision = ?${publicationGateSql()}`,
    ).bind(input.actorId, reason, input.recipeId, input.expectedRevision),
    publicationEventStatement(database, {
      recipeId: input.recipeId,
      actorId: input.actorId,
      action: "published_now",
      expectedRevision: input.expectedRevision,
      resultingRevision: nextRevision,
      scheduledPublishAt: current.scheduled_publish_at,
      reason,
    }),
  ]);
  if (!results[0]?.success || (results[0].meta.changes ?? 0) !== 1 || !results[1]?.success) {
    throw new RecipeSubmissionError("conflict", "The recipe, content, or attached media changed concurrently. Reload the review page.");
  }
  return { id: input.recipeId, status: "published" as const, revision: nextRevision };
}

export async function scheduleRecipePublication(input: {
  recipeId: string;
  actorId: string;
  expectedRevision: number;
  scheduledPublishAt?: string;
  reason?: string;
}) {
  if (!getRecipeSubmissionReadiness().ready) {
    throw new RecipeSubmissionError("unavailable", "Recipe scheduling is not ready.");
  }
  const database = getDatabase()!;
  const current = await publicationCheck(database, input.recipeId);
  if (!current) throw new RecipeSubmissionError("invalid", "Recipe submission was not found.");
  if (current.status !== "review") throw new RecipeSubmissionError("conflict", "Only a recipe in editorial review can be scheduled.");
  assertExpectedRevision(current, input.expectedRevision);
  assertPublicationReady(current);

  const scheduledPublishAt = toSqlTimestamp(input.scheduledPublishAt);
  const reason = cleanReason(input.reason, "Scheduled after editorial review.");
  const nextRevision = input.expectedRevision + 1;
  const results = await database.batch([
    database.prepare(
      `UPDATE recipes
       SET scheduled_publish_at = ?,
           scheduled_by = ?,
           schedule_revision = revision + 1,
           revision = revision + 1,
           editorial_actor_id = ?,
           editorial_reason = ?,
           reviewed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'review' AND revision = ?${publicationGateSql()}`,
    ).bind(scheduledPublishAt, input.actorId, input.actorId, reason, input.recipeId, input.expectedRevision),
    publicationEventStatement(database, {
      recipeId: input.recipeId,
      actorId: input.actorId,
      action: "schedule",
      expectedRevision: input.expectedRevision,
      resultingRevision: nextRevision,
      scheduledPublishAt,
      reason,
    }),
  ]);
  if (!results[0]?.success || (results[0].meta.changes ?? 0) !== 1 || !results[1]?.success) {
    throw new RecipeSubmissionError("conflict", "The recipe or attached media changed before the schedule could be saved.");
  }
  return { id: input.recipeId, status: "review" as const, revision: nextRevision, scheduledPublishAt };
}

export async function cancelRecipeSchedule(input: {
  recipeId: string;
  actorId: string;
  expectedRevision: number;
  reason?: string;
}) {
  if (!getRecipeSubmissionReadiness().ready) {
    throw new RecipeSubmissionError("unavailable", "Recipe scheduling is not ready.");
  }
  const database = getDatabase()!;
  const current = await publicationCheck(database, input.recipeId);
  if (!current) throw new RecipeSubmissionError("invalid", "Recipe submission was not found.");
  if (current.status !== "review" || !current.scheduled_publish_at || current.schedule_revision !== current.revision) {
    throw new RecipeSubmissionError("conflict", "This recipe does not have an active publication schedule.");
  }
  assertExpectedRevision(current, input.expectedRevision);

  const reason = cleanReason(input.reason, "Scheduled publication cancelled.");
  const nextRevision = input.expectedRevision + 1;
  const results = await database.batch([
    database.prepare(
      `UPDATE recipes
       SET scheduled_publish_at = NULL,
           scheduled_by = NULL,
           schedule_revision = NULL,
           revision = revision + 1,
           editorial_actor_id = ?,
           editorial_reason = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND status = 'review'
         AND revision = ?
         AND schedule_revision = revision
         AND scheduled_publish_at IS NOT NULL`,
    ).bind(input.actorId, reason, input.recipeId, input.expectedRevision),
    publicationEventStatement(database, {
      recipeId: input.recipeId,
      actorId: input.actorId,
      action: "cancel_schedule",
      expectedRevision: input.expectedRevision,
      resultingRevision: nextRevision,
      scheduledPublishAt: current.scheduled_publish_at,
      reason,
    }),
  ]);
  if (!results[0]?.success || (results[0].meta.changes ?? 0) !== 1 || !results[1]?.success) {
    throw new RecipeSubmissionError("conflict", "The publication schedule changed concurrently.");
  }
  return { id: input.recipeId, status: "review" as const, revision: nextRevision, scheduledPublishAt: null };
}

export async function archiveRecipeSubmission(input: {
  recipeId: string;
  actorId: string;
  expectedRevision: number;
  reason?: string;
}) {
  if (!getRecipeSubmissionReadiness().ready) {
    throw new RecipeSubmissionError("unavailable", "Recipe archival is not ready.");
  }
  const reason = cleanReason(input.reason);
  if (!reason || reason.length < 5) {
    throw new RecipeSubmissionError("invalid", "Add a clear editorial reason before archiving the submission.");
  }
  const database = getDatabase()!;
  const current = await publicationCheck(database, input.recipeId);
  if (!current) throw new RecipeSubmissionError("invalid", "Recipe submission was not found.");
  if (current.status !== "review") throw new RecipeSubmissionError("conflict", "Only a recipe in editorial review can be archived.");
  assertExpectedRevision(current, input.expectedRevision);

  const nextRevision = input.expectedRevision + 1;
  const results = await database.batch([
    database.prepare(
      `UPDATE recipes
       SET status = 'archived',
           revision = revision + 1,
           editorial_actor_id = ?,
           editorial_reason = ?,
           reviewed_at = CURRENT_TIMESTAMP,
           archived_at = CURRENT_TIMESTAMP,
           scheduled_publish_at = NULL,
           scheduled_by = NULL,
           schedule_revision = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'review' AND revision = ?`,
    ).bind(input.actorId, reason, input.recipeId, input.expectedRevision),
    publicationEventStatement(database, {
      recipeId: input.recipeId,
      actorId: input.actorId,
      action: "archive",
      expectedRevision: input.expectedRevision,
      resultingRevision: nextRevision,
      scheduledPublishAt: current.scheduled_publish_at,
      reason,
    }),
  ]);
  if (!results[0]?.success || (results[0].meta.changes ?? 0) !== 1 || !results[1]?.success) {
    throw new RecipeSubmissionError("conflict", "The recipe changed before it could be archived.");
  }
  return { id: input.recipeId, status: "archived" as const, revision: nextRevision };
}

export async function restoreArchivedRecipe(input: {
  recipeId: string;
  actorId: string;
  expectedRevision: number;
  reason?: string;
}) {
  if (!getRecipeSubmissionReadiness().ready) {
    throw new RecipeSubmissionError("unavailable", "Recipe restoration is not ready.");
  }
  const reason = cleanReason(input.reason);
  if (!reason || reason.length < 5) {
    throw new RecipeSubmissionError("invalid", "Add a clear editorial reason before restoring the archived recipe.");
  }
  const database = getDatabase()!;
  const current = await publicationCheck(database, input.recipeId);
  if (!current) throw new RecipeSubmissionError("invalid", "Archived recipe was not found.");
  if (current.status !== "archived") throw new RecipeSubmissionError("conflict", "This recipe is not archived.");
  assertExpectedRevision(current, input.expectedRevision);

  const nextRevision = input.expectedRevision + 1;
  const results = await database.batch([
    database.prepare(
      `UPDATE recipes
       SET status = 'review',
           revision = revision + 1,
           editorial_actor_id = ?,
           editorial_reason = ?,
           submitted_at = CURRENT_TIMESTAMP,
           reviewed_at = CURRENT_TIMESTAMP,
           restored_at = CURRENT_TIMESTAMP,
           scheduled_publish_at = NULL,
           scheduled_by = NULL,
           schedule_revision = NULL,
           revision_write_token = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'archived' AND revision = ?`,
    ).bind(input.actorId, reason, input.recipeId, input.expectedRevision),
    publicationEventStatement(database, {
      recipeId: input.recipeId,
      actorId: input.actorId,
      action: "restore",
      expectedRevision: input.expectedRevision,
      resultingRevision: nextRevision,
      scheduledPublishAt: null,
      reason,
    }),
  ]);
  if (!results[0]?.success || (results[0].meta.changes ?? 0) !== 1 || !results[1]?.success) {
    throw new RecipeSubmissionError("conflict", "The archived recipe changed before it could be restored.");
  }
  return { id: input.recipeId, status: "review" as const, revision: nextRevision };
}

async function publishScheduledRecipe(database: D1Database, input: {
  recipeId: string;
  actorId: string;
  expectedRevision: number;
  scheduledPublishAt: string;
}) {
  const current = await publicationCheck(database, input.recipeId);
  if (!current || current.status !== "review") {
    throw new RecipeSubmissionError("conflict", "Scheduled recipe is no longer in review.");
  }
  assertExpectedRevision(current, input.expectedRevision);
  if (current.schedule_revision !== current.revision || current.scheduled_publish_at !== input.scheduledPublishAt) {
    throw new RecipeSubmissionError("conflict", "Scheduled recipe changed after it was queued.");
  }
  assertPublicationReady(current);

  const reason = "Published by the guarded scheduled-publication processor.";
  const nextRevision = input.expectedRevision + 1;
  const results = await database.batch([
    database.prepare(
      `UPDATE recipes
       SET status = 'published',
           revision = revision + 1,
           editorial_actor_id = ?,
           editorial_reason = ?,
           reviewed_at = CURRENT_TIMESTAMP,
           published_at = CURRENT_TIMESTAMP,
           scheduled_publish_at = NULL,
           scheduled_by = NULL,
           schedule_revision = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND status = 'review'
         AND revision = ?
         AND schedule_revision = revision
         AND scheduled_publish_at = ?
         AND scheduled_publish_at <= CURRENT_TIMESTAMP${publicationGateSql()}`,
    ).bind(input.actorId, reason, input.recipeId, input.expectedRevision, input.scheduledPublishAt),
    publicationEventStatement(database, {
      recipeId: input.recipeId,
      actorId: input.actorId,
      action: "scheduled_published",
      expectedRevision: input.expectedRevision,
      resultingRevision: nextRevision,
      scheduledPublishAt: input.scheduledPublishAt,
      reason,
    }),
  ]);
  if (!results[0]?.success || (results[0].meta.changes ?? 0) !== 1 || !results[1]?.success) {
    throw new RecipeSubmissionError("conflict", "Scheduled publication lost its revision or media gate.");
  }
  return { id: input.recipeId, revision: nextRevision };
}

export async function processDueScheduledPublications(input: {
  actorId: string;
  limit?: number;
}) {
  if (!getRecipeSubmissionReadiness().ready) {
    throw new RecipeSubmissionError("unavailable", "Scheduled publication processing is not ready.");
  }
  const database = getDatabase()!;
  const limit = Math.min(Math.max(Math.round(input.limit ?? 10), 1), 25);
  const due = await database.prepare(
    `SELECT id, revision, scheduled_publish_at
     FROM recipes
     WHERE status = 'review'
       AND scheduled_publish_at IS NOT NULL
       AND schedule_revision = revision
       AND scheduled_publish_at <= CURRENT_TIMESTAMP
     ORDER BY scheduled_publish_at ASC, id ASC
     LIMIT ?`,
  ).bind(limit).all<DueScheduleRow>();

  const published: string[] = [];
  const skipped: Array<{ id: string; error: string }> = [];
  for (const recipe of due.results ?? []) {
    try {
      await publishScheduledRecipe(database, {
        recipeId: recipe.id,
        actorId: input.actorId,
        expectedRevision: recipe.revision,
        scheduledPublishAt: recipe.scheduled_publish_at,
      });
      published.push(recipe.id);
    } catch (error) {
      skipped.push({
        id: recipe.id,
        error: error instanceof Error ? error.message : "Scheduled publication failed.",
      });
    }
  }
  return { checked: due.results?.length ?? 0, published, skipped };
}

export async function listPublicationOperations(limit = 50) {
  const database = getDatabase();
  if (!database) return [];
  const bounded = Math.min(Math.max(limit, 1), 100);
  const result = await database.prepare(
    `SELECT r.id, r.title, r.slug, r.status, r.revision,
            r.scheduled_publish_at, r.schedule_revision, r.archived_at, r.restored_at,
            r.updated_at, u.display_name AS author_name
     FROM recipes r
     JOIN users u ON u.id = r.author_id
     WHERE (r.status = 'review' AND r.scheduled_publish_at IS NOT NULL)
        OR r.status = 'archived'
     ORDER BY
       CASE WHEN r.status = 'review' THEN 0 ELSE 1 END,
       COALESCE(r.scheduled_publish_at, r.archived_at, r.updated_at) ASC
     LIMIT ?`,
  ).bind(bounded).all();
  return result.results ?? [];
}

export async function listRecipePublicationEvents(recipeId: string, limit = 50) {
  const database = getDatabase();
  if (!database) return [];
  const bounded = Math.min(Math.max(limit, 1), 100);
  const result = await database.prepare(
    `SELECT e.action, e.expected_revision, e.resulting_revision,
            e.scheduled_publish_at, e.reason, e.created_at,
            u.display_name AS actor_name
     FROM recipe_publication_events e
     JOIN users u ON u.id = e.actor_id
     WHERE e.recipe_id = ?
     ORDER BY e.created_at DESC
     LIMIT ?`,
  ).bind(recipeId, bounded).all();
  return result.results ?? [];
}
