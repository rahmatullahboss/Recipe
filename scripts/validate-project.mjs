import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { fallbackCategories, fallbackRecipes } from "../src/data/fallback-recipes.ts";
import { markets } from "../src/lib/market.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function fail(message) {
  errors.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function validateCategories() {
  const allowedTypes = new Set(["meal", "ingredient", "cuisine", "occasion", "diet", "collection", "method"]);
  const duplicateIds = findDuplicates(fallbackCategories.map((category) => category.id));
  const duplicateSlugs = findDuplicates(fallbackCategories.map((category) => category.slug));

  assert(duplicateIds.length === 0, `Duplicate category IDs: ${duplicateIds.join(", ")}`);
  assert(duplicateSlugs.length === 0, `Duplicate category slugs: ${duplicateSlugs.join(", ")}`);

  for (const category of fallbackCategories) {
    assert(category.id.trim().length > 0, "Every category requires an ID.");
    assert(/^[a-z0-9-]+$/.test(category.slug), `Invalid category slug: ${category.slug}`);
    assert(category.name.trim().length >= 2, `Category name is too short: ${category.slug}`);
    assert(allowedTypes.has(category.type), `Unsupported category type ${category.type} on ${category.slug}`);
  }
}

function validateRecipes() {
  const categorySlugs = new Set(fallbackCategories.map((category) => category.slug));
  const supportedMarketCodes = new Set(markets.map((market) => market.code));
  const duplicateIds = findDuplicates(fallbackRecipes.map((recipe) => recipe.id));
  const duplicateSlugs = findDuplicates(fallbackRecipes.map((recipe) => recipe.slug));
  const duplicateIngredientIds = findDuplicates(fallbackRecipes.flatMap((recipe) => recipe.ingredients.map((ingredient) => ingredient.id)));
  const duplicateStepIds = findDuplicates(fallbackRecipes.flatMap((recipe) => recipe.steps.map((step) => step.id)));

  assert(duplicateIds.length === 0, `Duplicate recipe IDs: ${duplicateIds.join(", ")}`);
  assert(duplicateSlugs.length === 0, `Duplicate recipe slugs: ${duplicateSlugs.join(", ")}`);
  assert(duplicateIngredientIds.length === 0, `Duplicate ingredient IDs: ${duplicateIngredientIds.join(", ")}`);
  assert(duplicateStepIds.length === 0, `Duplicate step IDs: ${duplicateStepIds.join(", ")}`);

  for (const market of markets) {
    const marketRecipes = fallbackRecipes.filter((recipe) => recipe.country_code === market.code);
    assert(marketRecipes.length >= 1, `No fallback recipe exists for ${market.name} (${market.code}).`);
  }

  for (const recipe of fallbackRecipes) {
    const label = `${recipe.title} (${recipe.slug})`;
    assert(/^[a-z0-9-]+$/.test(recipe.slug), `Invalid recipe slug: ${recipe.slug}`);
    assert(recipe.title.trim().length >= 5 && recipe.title.length <= 120, `Invalid title length for ${label}`);
    assert(recipe.summary.trim().length >= 20 && recipe.summary.length <= 240, `Invalid summary length for ${label}`);
    assert(Boolean(recipe.description?.trim()), `Missing description for ${label}`);
    assert(supportedMarketCodes.has(recipe.country_code), `Unsupported country ${recipe.country_code} for ${label}`);
    assert(Number.isInteger(recipe.prep_minutes) && recipe.prep_minutes >= 0, `Invalid prep time for ${label}`);
    assert(Number.isInteger(recipe.cook_minutes) && recipe.cook_minutes >= 0, `Invalid cook time for ${label}`);
    assert(Number.isInteger(recipe.servings) && recipe.servings > 0, `Invalid servings for ${label}`);
    assert(["easy", "medium", "hard"].includes(recipe.difficulty), `Invalid difficulty for ${label}`);
    assert(recipe.average_rating >= 0 && recipe.average_rating <= 5, `Invalid rating for ${label}`);
    assert(Number.isInteger(recipe.rating_count) && recipe.rating_count >= 0, `Invalid rating count for ${label}`);
    assert(Number.isInteger(recipe.save_count) && recipe.save_count >= 0, `Invalid save count for ${label}`);
    assert(Number.isInteger(recipe.view_count) && recipe.view_count >= 0, `Invalid view count for ${label}`);
    assert(recipe.image_url === null || recipe.image_url.startsWith("https://"), `Recipe image must use HTTPS for ${label}`);
    assert(recipe.ingredients.length >= 2, `At least two ingredients are required for ${label}`);
    assert(recipe.steps.length >= 2, `At least two directions are required for ${label}`);
    assert(recipe.categories.length >= 1, `At least one category is required for ${label}`);

    const categoryDuplicates = findDuplicates(recipe.categories.map((category) => category.slug));
    assert(categoryDuplicates.length === 0, `Duplicate categories on ${label}: ${categoryDuplicates.join(", ")}`);

    for (const category of recipe.categories) {
      assert(categorySlugs.has(category.slug), `Unknown category ${category.slug} referenced by ${label}`);
    }

    const ingredientOrder = recipe.ingredients.map((ingredient) => ingredient.sort_order);
    const expectedIngredientOrder = recipe.ingredients.map((_, index) => index + 1);
    assert(JSON.stringify(ingredientOrder) === JSON.stringify(expectedIngredientOrder), `Ingredient sort order is not sequential for ${label}`);

    for (const ingredient of recipe.ingredients) {
      assert(ingredient.item.trim().length >= 2, `Invalid ingredient name ${ingredient.id} on ${label}`);
      assert(ingredient.amount === null || ingredient.amount.length <= 32, `Ingredient amount is too long on ${label}`);
      assert(ingredient.unit === null || ingredient.unit.length <= 32, `Ingredient unit is too long on ${label}`);
    }

    const stepOrder = recipe.steps.map((step) => step.sort_order);
    const expectedStepOrder = recipe.steps.map((_, index) => index + 1);
    assert(JSON.stringify(stepOrder) === JSON.stringify(expectedStepOrder), `Step sort order is not sequential for ${label}`);

    for (const step of recipe.steps) {
      assert(step.instruction.trim().length >= 10, `Direction ${step.id} is too short on ${label}`);
      assert(step.timer_seconds === null || step.timer_seconds >= 0, `Invalid timer on ${label}`);
    }
  }
}

async function validateMigrations() {
  const migrationDirectory = path.join(root, "migrations", "d1");
  const entries = (await readdir(migrationDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const expected = [
    "0001_initial",
    "0002_seed",
    "0003_market_coverage",
    "0004_auth_accounts",
    "0005_media_pipeline",
  ];

  assert(JSON.stringify(entries) === JSON.stringify(expected), `Unexpected D1 migration directories: ${entries.join(", ")}`);

  const migrationSql = new Map();
  for (const directory of expected) {
    const filename = path.join(migrationDirectory, directory, "migration.sql");
    const sql = await readFile(filename, "utf8");
    migrationSql.set(directory, sql);
    assert(sql.trim().length > 0, `Migration is empty: ${directory}/migration.sql`);
    assert(sql.includes(";"), `Migration contains no SQL statement terminator: ${directory}/migration.sql`);
  }

  const initial = migrationSql.get("0001_initial") ?? "";
  assert(initial.includes("measurement_system"), "Initial migration is missing measurement_system.");
  assert(initial.includes("recipe_localizations"), "Initial migration is missing recipe_localizations.");
  assert(initial.includes("recipe_nutrition"), "Initial migration is missing recipe_nutrition.");

  const coverage = migrationSql.get("0003_market_coverage") ?? "";
  for (const code of ["CA", "NZ", "DE", "CH", "SE", "NL"]) {
    assert(coverage.includes(`'${code}'`), `Market coverage migration is missing ${code}.`);
  }

  const auth = migrationSql.get("0004_auth_accounts") ?? "";
  for (const field of [
    "email_verified_at",
    "pending_verification",
    "auth_version",
    "password_changed_at",
    "last_login_at",
    "failed_login_count",
    "locked_until",
    "auth_tokens",
    "auth_identities",
    "user_consents",
    "auth_audit_events",
    "idx_users_email_nocase",
  ]) {
    assert(auth.includes(field), `Authentication migration is missing ${field}.`);
  }

  const media = migrationSql.get("0005_media_pipeline") ?? "";
  for (const field of [
    "media_upload_intents",
    "token_hash",
    "moderation_status",
    "quarantined",
    "media_moderation_events",
    "sha256",
    "storage_etag",
    "8388608",
  ]) {
    assert(media.includes(field), `Media migration is missing ${field}.`);
  }

  const wrangler = await readFile(path.join(root, "wrangler.d1.jsonc"), "utf8");
  assert(wrangler.includes('"migrations_pattern": "migrations/d1/*/migration.sql"'), "Wrangler is not using the authoritative nested migration layout.");
}

async function validateAuthFoundation() {
  const source = await readFile(path.join(root, "src", "lib", "auth.ts"), "utf8");
  assert(source.includes("PASSWORD_ITERATIONS = 600_000"), "Password hashing work factor was reduced below the approved baseline.");
  assert(source.includes("__Host-ozzyl_session"), "Production session cookie must retain the __Host- prefix.");
  assert(source.includes("https://challenges.cloudflare.com/turnstile/v0/siteverify"), "Turnstile Siteverify integration is missing.");
  assert(source.includes("validateCsrfToken"), "Signed CSRF validation is missing from the authentication foundation.");
  assert(source.includes("constantTimeEqual"), "Constant-time credential comparison is missing.");
  assert(source.includes("pending_verification"), "Registration must keep new accounts pending email verification.");

  const verification = await readFile(path.join(root, "src", "lib", "email-verification.ts"), "utf8");
  assert(verification.includes("auth_tokens"), "Email verification tokens are not stored in D1.");
  assert(verification.includes("token_hash"), "Email verification token digests are not persisted.");

  const middleware = await readFile(path.join(root, "src", "middleware.ts"), "utf8");
  assert(middleware.includes("https://challenges.cloudflare.com"), "Content Security Policy does not allow the Turnstile origin.");
  assert(middleware.includes("getAuthContext"), "Authentication context is not loaded by middleware.");
}

async function validateMediaFoundation() {
  const source = await readFile(path.join(root, "src", "lib", "media.ts"), "utf8");
  assert(source.includes("MAX_MEDIA_BYTES = 8 * 1024 * 1024"), "Media upload size limit changed unexpectedly.");
  assert(source.includes('"image/jpeg"') && source.includes('"image/png"') && source.includes('"image/webp"'), "Approved image MIME types are incomplete.");
  assert(!source.includes('"image/svg+xml"'), "SVG uploads must remain disabled.");
  assert(source.includes("parsePng") && source.includes("parseJpeg") && source.includes("parseWebp"), "Image signature and dimension validation is incomplete.");
  assert(source.includes("claimUploadIntent"), "One-time media upload intent claiming is missing.");
  assert(source.includes("media_moderation_events"), "Media moderation audit events are missing.");

  const delivery = await readFile(path.join(root, "src", "pages", "media", "[...key].ts"), "utf8");
  assert(delivery.includes('moderation_status === "approved"'), "Public media delivery is not approval-gated.");
  assert(delivery.includes('"private, no-store"'), "Pending media previews must remain private and uncached.");
  assert(delivery.includes('"nosniff"'), "Media delivery must prevent content sniffing.");
}

async function validateBrowserScripts() {
  const scriptsDirectory = path.join(root, "public", "scripts");
  const scriptNames = (await readdir(scriptsDirectory))
    .filter((filename) => filename.endsWith(".js"))
    .sort();
  const files = [
    ...scriptNames.map((filename) => path.join(scriptsDirectory, filename)),
    path.join(root, "public", "sw.js"),
  ];

  assert(files.length >= 2, "No public browser scripts were found for validation.");

  for (const filename of files) {
    const result = spawnSync(process.execPath, ["--check", filename], {
      cwd: root,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      const relative = path.relative(root, filename);
      fail(`Invalid JavaScript syntax in ${relative}: ${(result.stderr || result.stdout || "unknown syntax error").trim()}`);
    }
  }
}

validateCategories();
validateRecipes();
await validateMigrations();
await validateAuthFoundation();
await validateMediaFoundation();
await validateBrowserScripts();

if (errors.length > 0) {
  console.error(`Project validation failed with ${errors.length} issue${errors.length === 1 ? "" : "s"}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Validated ${fallbackRecipes.length} recipes, ${fallbackCategories.length} categories, ${markets.length} markets, authoritative D1 migrations, authentication and media invariants, and public browser scripts.`);
