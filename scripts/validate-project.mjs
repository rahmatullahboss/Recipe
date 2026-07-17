import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { fallbackCategories, fallbackRecipes } from "../src/data/fallback-recipes.ts";
import { markets } from "../src/lib/market.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
const duplicates = (items) => items.filter((item, index) => items.indexOf(item) !== index);

function validateCatalogue() {
  assert(duplicates(fallbackCategories.map((item) => item.id)).length === 0, "Fallback category IDs must be unique.");
  assert(duplicates(fallbackCategories.map((item) => item.slug)).length === 0, "Fallback category slugs must be unique.");
  assert(duplicates(fallbackRecipes.map((item) => item.id)).length === 0, "Fallback recipe IDs must be unique.");
  assert(duplicates(fallbackRecipes.map((item) => item.slug)).length === 0, "Fallback recipe slugs must be unique.");
  for (const market of markets) {
    assert(fallbackRecipes.some((recipe) => recipe.country_code === market.code), `Missing fallback recipe for ${market.code}.`);
  }
  for (const recipe of fallbackRecipes) {
    assert(recipe.title.trim().length >= 5, `Recipe title is too short: ${recipe.slug}.`);
    assert(recipe.summary.trim().length >= 20, `Recipe summary is too short: ${recipe.slug}.`);
    assert(recipe.ingredients.length >= 2, `Recipe requires two ingredients: ${recipe.slug}.`);
    assert(recipe.steps.length >= 2, `Recipe requires two steps: ${recipe.slug}.`);
    assert(recipe.categories.length >= 1, `Recipe requires one category: ${recipe.slug}.`);
  }
}

async function validateMigrations() {
  const directory = path.join(root, "migrations", "d1");
  const expected = [
    "0001_initial",
    "0002_seed",
    "0003_market_coverage",
    "0004_auth_accounts",
    "0005_media_pipeline",
    "0006_recipe_editorial",
    "0007_recipe_revisions",
    "0008_media_derivatives",
    "0009_recipe_publication_workflow",
    "0010_published_recipe_change_sets",
    "0011_editor_change_set_origins",
  ];
  const actual = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected), `Unexpected D1 migrations: ${actual.join(", ")}.`);

  const sql = new Map();
  for (const name of expected) {
    const source = await readFile(path.join(directory, name, "migration.sql"), "utf8");
    sql.set(name, source);
    assert(source.trim().length > 0 && source.includes(";"), `Invalid migration: ${name}.`);
  }

  for (const token of ["recipe_localizations", "recipe_nutrition", "media_assets"]) {
    assert(sql.get("0001_initial")?.includes(token), `Initial migration is missing ${token}.`);
  }
  for (const token of ["auth_tokens", "user_consents", "auth_audit_events", "idx_users_email_nocase"]) {
    assert(sql.get("0004_auth_accounts")?.includes(token), `Auth migration is missing ${token}.`);
  }
  for (const token of ["media_upload_intents", "media_moderation_events", "moderation_status", "storage_etag", "8388608"]) {
    assert(sql.get("0005_media_pipeline")?.includes(token), `Media migration is missing ${token}.`);
  }
  for (const token of ["media_asset_id", "revision", "recipe_editorial_events", "recipes_record_initial_review_submission", "recipes_record_editorial_transition"]) {
    assert(sql.get("0006_recipe_editorial")?.includes(token), `Editorial migration is missing ${token}.`);
  }
  for (const token of ["content_revision", "change_requested_at", "revision_write_token", "recipe_revision_snapshots", "initial_submission", "resubmission"]) {
    assert(sql.get("0007_recipe_revisions")?.includes(token), `Recipe revision migration is missing ${token}.`);
  }
  for (const token of [
    "media_derivative_jobs",
    "media_derivatives",
    "source_orientation",
    "normalized_width",
    "generation_token",
    "policy_version",
    "source_sha256",
    "cleanup_pending",
    "media_assets_derivatives_regenerate_after_source_change",
  ]) {
    assert(sql.get("0008_media_derivatives")?.includes(token), `Media derivative migration is missing ${token}.`);
  }
  for (const token of [
    "scheduled_publish_at",
    "scheduled_by",
    "schedule_revision",
    "archived_at",
    "restored_at",
    "recipe_publication_events",
    "scheduled_published",
    "idx_recipes_scheduled_publication",
  ]) {
    assert(sql.get("0009_recipe_publication_workflow")?.includes(token), `Recipe publication workflow migration is missing ${token}.`);
  }
  for (const token of [
    "recipe_change_sets",
    "recipe_change_set_events",
    "base_recipe_revision",
    "base_content_revision",
    "base_content_json",
    "content_json",
    "idx_recipe_change_sets_one_active_per_recipe",
    "idx_recipe_change_sets_active_media",
    "recipe_change_sets_require_published_owner_insert",
    "recipe_change_sets_media_not_assigned_elsewhere_insert",
    "recipes_media_not_reserved_by_change_set_insert",
  ]) {
    assert(sql.get("0010_published_recipe_change_sets")?.includes(token), `Published recipe change-set migration is missing ${token}.`);
  }
  for (const token of [
    "recipe_change_set_origins",
    "editor_current",
    "revision_snapshot",
    "approved_change_set_proposed",
    "approved_change_set_baseline",
    "media_fallback_applied",
    "recipe_change_set_origins_immutable",
    "recipe_change_set_origins_require_editor_creator",
    "recipe_change_set_origins_match_change_set_creator",
  ]) {
    assert(sql.get("0011_editor_change_set_origins")?.includes(token), `Editor change-set origin migration is missing ${token}.`);
  }

  const wrangler = await readFile(path.join(root, "wrangler.d1.jsonc"), "utf8");
  assert(wrangler.includes('"migrations_pattern": "migrations/d1/*/migration.sql"'), "Wrangler migration pattern changed.");
  assert(wrangler.includes('"AUTH_ENABLED": "false"'), "Authentication must remain disabled by default.");
  assert(wrangler.includes('"AUTH_REGISTRATION_ENABLED": "false"'), "Authentication registration must remain disabled by default.");
  assert(wrangler.includes('"MEDIA_UPLOADS_ENABLED": "false"'), "Media uploads must remain disabled by default.");
  assert(wrangler.includes('"RECIPE_SUBMISSIONS_ENABLED": "false"'), "Recipe submissions must remain disabled by default.");

  const ci = await readFile(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
  assert(ci.includes("npm run db:migrate:local"), "CI must execute the authoritative migration chain locally.");
  assert(ci.includes("npm run build\n"), "CI must build the D1-free Worker.");
  assert(ci.includes("npm run build:d1"), "CI must build the D1 Worker.");

  const activation = await readFile(path.join(root, ".github", "workflows", "enable-auth.yml"), "utf8");
  for (const token of [
    "Cloudflare Images binding is not ready",
    "unexpected media derivative policy",
    "private originals could be publicly delivered",
    "ready derivative delivery gate is unavailable",
    "required JPEG/WebP fallback matrix is unavailable",
    "published recipe private change sets are not available",
    "published change-set base revision guard is not available",
    "published change-set media reservation is not available",
    "published change-set atomic promotion is not available",
    "editor-authored published change sets are not available",
    "historical recipe snapshot restore is not available",
    "editor change-set origin audit is not available",
    "editor change-set contributor draft lock is not available",
    "historical snapshot media fallback is not available",
    "editor change-set shared atomic approval is not available",
  ]) {
    assert(activation.includes(token), `Guarded activation capability check is missing: ${token}.`);
  }
}

async function validateSecurityFoundations() {
  const auth = await readFile(path.join(root, "src", "lib", "auth.ts"), "utf8");
  for (const token of ["PASSWORD_ITERATIONS = 600_000", "__Host-ozzyl_session", "validateCsrfToken", "constantTimeEqual"]) {
    assert(auth.includes(token), `Authentication invariant is missing: ${token}.`);
  }

  const media = await readFile(path.join(root, "src", "lib", "media.ts"), "utf8");
  for (const token of [
    "MAX_MEDIA_BYTES = 8 * 1024 * 1024",
    "parsePng",
    "parseJpeg",
    "parseWebp",
    "parseJpegOrientation",
    "parsePngOrientation",
    "parseWebpOrientation",
    "normalisedDimensions",
    "source_orientation",
    "media_derivative_jobs",
    "claimUploadIntent",
  ]) {
    assert(media.includes(token), `Media invariant is missing: ${token}.`);
  }
  assert(!media.includes('"image/svg+xml"'), "SVG uploads must remain disabled.");

  const derivatives = await readFile(path.join(root, "src", "lib", "media-derivatives.ts"), "utf8");
  for (const token of [
    "MEDIA_DERIVATIVE_POLICY_VERSION",
    "generation_token",
    "lock_expires_at",
    "Private original checksum does not match D1",
    "assertJpegMetadataStripped",
    "assertWebpMetadataStripped",
    "assertAvifMetadataStripped",
    '"image/avif"',
    '"jpeg", "webp", "avif"',
    "cleanupMediaDerivatives",
    "findReadyMediaDerivative",
    "await bucket.delete(key)",
  ]) {
    assert(derivatives.includes(token), `Derivative invariant is missing: ${token}.`);
  }

  const delivery = await readFile(path.join(root, "src", "pages", "media", "[...key].ts"), "utf8");
  assert(delivery.includes('moderation_status === "approved"'), "Public media delivery must require approval.");
  assert(delivery.includes("findReadyMediaDerivative"), "Public media delivery must use approved derivatives.");
  assert(delivery.includes("media.get(derivative.r2_key)"), "Media delivery must fetch only derivative objects.");
  assert(!delivery.includes("media.get(key)"), "Public media delivery must never fetch original objects.");
  assert(delivery.includes('"private, no-store"'), "Private media previews must not be cached.");
  assert(delivery.includes("mediaDerivativeCacheToken"), "Public derivative URLs must be policy and checksum versioned.");
  assert(delivery.includes("X-Content-SHA256"), "Derivative checksum response metadata is missing.");

  const editorial = await readFile(path.join(root, "src", "lib", "recipe-submissions.ts"), "utf8");
  for (const token of [
    "MEDIA_DERIVATIVE_POLICY_VERSION",
    "derivative_ready",
    "media_derivative_jobs",
    "ready_variant_count >= j.required_variant_count",
    "RECIPE_SUBMISSIONS_ENABLED",
    "database.batch(statements)",
    "resolveOwnedHeroMedia",
    "moderation_status IN ('pending', 'approved')",
    'current.media_status !== "approved"',
    "revision = revision + 1",
  ]) {
    assert(editorial.includes(token), `Recipe editorial invariant is missing: ${token}.`);
  }

  const revisions = await readFile(path.join(root, "src", "lib", "recipe-revisions.ts"), "utf8");
  for (const token of [
    "requestRecipeChanges",
    "resubmitRecipeRevision",
    "recipe_revision_snapshots",
    "revision_write_token",
    "status = 'draft'",
    "content_revision = content_revision + 1",
    "database.batch(statements)",
    "assigned.id <> ?",
    "MEDIA_DERIVATIVE_POLICY_VERSION",
    "media_derivative_jobs",
    "mediaDeliveryUrl",
  ]) {
    assert(revisions.includes(token), `Recipe revision invariant is missing: ${token}.`);
  }

  const publication = await readFile(path.join(root, "src", "lib", "recipe-publication.ts"), "utf8");
  for (const token of [
    "scheduleRecipePublication",
    "cancelRecipeSchedule",
    "processDueScheduledPublications",
    "restoreArchivedRecipe",
    "schedule_revision = revision",
    "scheduled_publish_at <= CURRENT_TIMESTAMP",
    "publicationGateSql",
    "database.batch",
    "automaticCronConfigured: false",
  ]) {
    assert(publication.includes(token), `Recipe publication workflow invariant is missing: ${token}.`);
  }

  const changeSets = await readFile(path.join(root, "src", "lib", "recipe-change-sets.ts"), "utf8");
  for (const token of [
    "startPublishedRecipeChangeSet",
    "savePublishedRecipeChangeSet",
    "requestPublishedRecipeChangeSetChanges",
    "approvePublishedRecipeChangeSet",
    "base_recipe_revision",
    "base_content_revision",
    "base_content_json",
    "content_json",
    "revision_write_token",
    "status = 'published'",
    "content_revision = content_revision + 1",
    "resolveOwnedChangeSetMedia",
    "MEDIA_DERIVATIVE_POLICY_VERSION",
    "database.batch(statements)",
    "atomicRelationalPromotion: true",
  ]) {
    assert(changeSets.includes(token), `Published recipe change-set invariant is missing: ${token}.`);
  }

  const editorChangeSets = await readFile(path.join(root, "src", "lib", "editor-recipe-change-sets.ts"), "utf8");
  for (const token of [
    "startEditorPublishedRecipeChangeSet",
    "saveEditorPublishedRecipeChangeSet",
    "cancelEditorPublishedRecipeChangeSet",
    "resolveHistoricalSource",
    "recipe_revision_snapshots",
    "approved-proposed:",
    "approved-baseline:",
    "recipe_change_set_origins",
    "mediaFallbackApplied",
    "base_recipe_revision",
    "base_content_revision",
    "status = 'published'",
    "MEDIA_DERIVATIVE_POLICY_VERSION",
    "getEditorRecipeChangeSetReadiness",
    "contributorDraftLock: true",
    "sharedAtomicApproval: true",
  ]) {
    assert(editorChangeSets.includes(token), `Editor-authored recipe change-set invariant is missing: ${token}.`);
  }

  const submitRoute = await readFile(path.join(root, "src", "pages", "api", "recipes", "submissions.ts"), "utf8");
  assert(submitRoute.includes('validateCsrfToken("recipe-submit"'), "Recipe submission CSRF check is missing.");
  assert(submitRoute.includes("consumeRateLimit"), "Recipe submission rate limit is missing.");
  assert(submitRoute.includes("validateRecipeDraft"), "Canonical recipe validation is missing from submission.");

  const resubmitRoute = await readFile(path.join(root, "src", "pages", "api", "recipes", "[id]", "resubmit.ts"), "utf8");
  assert(resubmitRoute.includes('validateCsrfToken("recipe-resubmit"'), "Recipe resubmission CSRF check is missing.");
  assert(resubmitRoute.includes("consumeRateLimit"), "Recipe resubmission rate limit is missing.");
  assert(resubmitRoute.includes("validateRecipeDraft"), "Canonical recipe validation is missing from resubmission.");
  assert(resubmitRoute.includes("expectedRevision"), "Recipe resubmission optimistic lock is missing.");

  const editorialRoute = await readFile(path.join(root, "src", "pages", "api", "recipes", "[id]", "editorial.ts"), "utf8");
  assert(editorialRoute.includes('validateCsrfToken("recipe-editorial"'), "Recipe editorial CSRF check is missing.");
  assert(editorialRoute.includes('locals.user.role !== "editor"'), "Recipe editorial role check is missing.");
  for (const token of ["request_changes", "schedule", "cancel_schedule", "restore", "publishRecipeNow"]) {
    assert(editorialRoute.includes(token), `Recipe editorial route is missing action: ${token}.`);
  }

  const scheduleRoute = await readFile(path.join(root, "src", "pages", "api", "recipes", "scheduled", "process.ts"), "utf8");
  assert(scheduleRoute.includes('validateCsrfToken("recipe-schedule-process"'), "Scheduled processor CSRF check is missing.");
  assert(scheduleRoute.includes('locals.user.role !== "editor"'), "Scheduled processor role check is missing.");
  assert(scheduleRoute.includes("processDueScheduledPublications"), "Scheduled processor implementation is missing.");
  assert(scheduleRoute.includes('"Cache-Control": "private, no-store"'), "Scheduled processor responses must remain private and no-store.");

  const contributorChangeSetRoute = await readFile(path.join(root, "src", "pages", "api", "recipes", "[id]", "change-set.ts"), "utf8");
  assert(contributorChangeSetRoute.includes('validateCsrfToken("recipe-published-change-set"'), "Published change-set contributor CSRF check is missing.");
  assert(contributorChangeSetRoute.includes("consumeRateLimit"), "Published change-set contributor rate limit is missing.");
  assert(contributorChangeSetRoute.includes("validateRecipeDraft"), "Published change-set canonical validation is missing.");
  assert(contributorChangeSetRoute.includes("isEditorControlledPublishedChangeSetDraft"), "Contributor route must refuse editor-controlled private drafts.");
  for (const token of ["create", "save", "submit", "cancel", "expectedRevision"]) {
    assert(contributorChangeSetRoute.includes(token), `Published change-set contributor route is missing: ${token}.`);
  }

  const editorChangeSetRoute = await readFile(path.join(root, "src", "pages", "api", "recipes", "[id]", "editor-change-set.ts"), "utf8");
  assert(editorChangeSetRoute.includes('validateCsrfToken("recipe-editor-authored-change-set"'), "Editor-authored change-set CSRF check is missing.");
  assert(editorChangeSetRoute.includes('locals.user.role !== "editor"'), "Editor-authored change-set role check is missing.");
  assert(editorChangeSetRoute.includes("consumeRateLimit"), "Editor-authored change-set rate limit is missing.");
  assert(editorChangeSetRoute.includes("validateRecipeDraft"), "Editor-authored change-set canonical validation is missing.");
  assert(editorChangeSetRoute.includes('"Cache-Control": "private, no-store"'), "Editor-authored change-set responses must remain private and no-store.");
  for (const token of ["restore_snapshot", "save", "submit", "cancel", "expectedRevision"]) {
    assert(editorChangeSetRoute.includes(token), `Editor-authored change-set route is missing: ${token}.`);
  }

  const editorChangeSetPage = await readFile(path.join(root, "src", "pages", "admin", "recipes", "[id]", "change-set.astro"), "utf8");
  for (const token of [
    "getEditorPublishedRecipeChangeSetWorkspace",
    "data-restore-source",
    "data-editor-authored-change-set",
    "Uploading on the contributor's behalf is intentionally unavailable",
    "Submit for review",
  ]) {
    assert(editorChangeSetPage.includes(token), `Editor-authored change-set page invariant is missing: ${token}.`);
  }

  const middleware = await readFile(path.join(root, "src", "middleware.ts"), "utf8");
  assert(middleware.includes("editor-change-set"), "Editor-authored change-set API must be marked private and no-store.");

  const changeSetEditorialRoute = await readFile(path.join(root, "src", "pages", "api", "recipe-change-sets", "[id]", "editorial.ts"), "utf8");
  assert(changeSetEditorialRoute.includes('validateCsrfToken("recipe-change-set-editorial"'), "Published change-set editorial CSRF check is missing.");
  assert(changeSetEditorialRoute.includes('locals.user.role !== "editor"'), "Published change-set editorial role check is missing.");
  for (const token of ["request_changes", "approve", "cancel", "expectedRevision"]) {
    assert(changeSetEditorialRoute.includes(token), `Published change-set editorial route is missing: ${token}.`);
  }

  const moderation = await readFile(path.join(root, "src", "lib", "media-moderation.ts"), "utf8");
  for (const token of ["media_derivative_jobs", "required_variant_count", "ready_variant_count", "MEDIA_DERIVATIVE_POLICY_VERSION"]) {
    assert(moderation.includes(token), `Media approval derivative gate is missing: ${token}.`);
  }

  const upload = await readFile(path.join(root, "src", "pages", "api", "media", "upload.ts"), "utf8");
  assert(upload.includes("generateMediaDerivatives"), "Media upload must start derivative generation after the original is committed.");
  assert(upload.includes('derivativeStatus: "failed"'), "Derivative upload failure must keep the private original without publishing it.");

  const derivativeRoute = await readFile(path.join(root, "src", "pages", "api", "media", "[id]", "derivatives.ts"), "utf8");
  assert(derivativeRoute.includes('validateCsrfToken("media-derivatives"'), "Derivative regeneration CSRF check is missing.");
  assert(derivativeRoute.includes("asset.owner_id !== locals.user.id"), "Derivative regeneration ownership gate is missing.");

  const deleteRoute = await readFile(path.join(root, "src", "pages", "api", "media", "[id].ts"), "utf8");
  assert(deleteRoute.includes('validateCsrfToken("media-delete"'), "Media deletion CSRF check is missing.");
  assert(deleteRoute.includes("FROM recipes"), "Media deletion must refuse live recipe assignments.");
  assert(deleteRoute.includes("FROM recipe_change_sets"), "Media deletion must refuse active change-set reservations.");
  assert(deleteRoute.includes("deleteOriginal: true"), "Media deletion must clean the private original after D1 denial.");

  const health = await readFile(path.join(root, "src", "pages", "api", "health.ts"), "utf8");
  for (const token of [
    "derivativePolicyVersion",
    "transformationsReady",
    "originalPublicDelivery",
    "publicDeliveryRequiresReadyDerivatives",
    "metadataStrippingVerified",
    "idempotentLocks",
    "scheduledPublishing",
    "guardedScheduleProcessor",
    "archiveRestore",
    "scheduledAtomicPromotion",
    "automaticScheduleCronConfigured",
    "publishedChangeSets",
    "oneActivePublishedChangeSet",
    "publishedChangeSetBaseGuard",
    "publishedChangeSetMediaReservation",
    "publishedChangeSetAtomicPromotion",
    "publishedChangeSetAuditEvents",
    "editorAuthoredPublishedChangeSets",
    "historicalSnapshotRestore",
    "editorChangeSetOriginAudit",
    "editorChangeSetContributorDraftLock",
    "editorChangeSetCurrentLiveBaseline",
    "historicalSnapshotMediaFallback",
    "editorChangeSetSharedAtomicApproval",
  ]) {
    assert(health.includes(token), `Health capability is missing: ${token}.`);
  }
}

async function validateBrowserScripts() {
  const directory = path.join(root, "public", "scripts");
  const files = (await readdir(directory)).filter((name) => name.endsWith(".js"));
  files.push("../sw.js");
  for (const name of files) {
    const filename = path.resolve(directory, name);
    const result = spawnSync(process.execPath, ["--check", filename], { cwd: root, encoding: "utf8" });
    assert(result.status === 0, `Invalid browser script ${path.relative(root, filename)}: ${(result.stderr || result.stdout || "syntax error").trim()}`);
  }
}

validateCatalogue();
await validateMigrations();
await validateSecurityFoundations();
await validateBrowserScripts();

if (errors.length) {
  console.error(`Project validation failed with ${errors.length} issue${errors.length === 1 ? "" : "s"}:`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Validated ${fallbackRecipes.length} recipes, ${fallbackCategories.length} categories, ${markets.length} markets, eleven D1 migrations, guarded authentication, privacy-safe media derivatives, scheduled publication, archive restoration, contributor and editor-authored private published recipe change sets, historical snapshot restoration, recipe editorial and contributor revision invariants, and browser scripts.`);
