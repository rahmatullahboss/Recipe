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

  const wrangler = await readFile(path.join(root, "wrangler.d1.jsonc"), "utf8");
  assert(wrangler.includes('"migrations_pattern": "migrations/d1/*/migration.sql"'), "Wrangler migration pattern changed.");
  assert(wrangler.includes('"AUTH_ENABLED": "false"'), "Authentication must remain disabled by default.");
  assert(wrangler.includes('"MEDIA_UPLOADS_ENABLED": "false"'), "Media uploads must remain disabled by default.");
  assert(wrangler.includes('"RECIPE_SUBMISSIONS_ENABLED": "false"'), "Recipe submissions must remain disabled by default.");
}

async function validateSecurityFoundations() {
  const auth = await readFile(path.join(root, "src", "lib", "auth.ts"), "utf8");
  for (const token of ["PASSWORD_ITERATIONS = 600_000", "__Host-ozzyl_session", "validateCsrfToken", "constantTimeEqual"]) {
    assert(auth.includes(token), `Authentication invariant is missing: ${token}.`);
  }

  const media = await readFile(path.join(root, "src", "lib", "media.ts"), "utf8");
  for (const token of ["MAX_MEDIA_BYTES = 8 * 1024 * 1024", "parsePng", "parseJpeg", "parseWebp", "claimUploadIntent"]) {
    assert(media.includes(token), `Media invariant is missing: ${token}.`);
  }
  assert(!media.includes('"image/svg+xml"'), "SVG uploads must remain disabled.");

  const delivery = await readFile(path.join(root, "src", "pages", "media", "[...key].ts"), "utf8");
  assert(delivery.includes('moderation_status === "approved"'), "Public media delivery must require approval.");
  assert(delivery.includes('"private, no-store"'), "Private media previews must not be cached.");

  const editorial = await readFile(path.join(root, "src", "lib", "recipe-submissions.ts"), "utf8");
  for (const token of [
    "RECIPE_SUBMISSIONS_ENABLED",
    "database.batch(statements)",
    "resolveOwnedHeroMedia",
    "moderation_status IN ('pending', 'approved')",
    'current.media_status !== "approved"',
    "revision = revision + 1",
  ]) {
    assert(editorial.includes(token), `Recipe editorial invariant is missing: ${token}.`);
  }

  const submitRoute = await readFile(path.join(root, "src", "pages", "api", "recipes", "submissions.ts"), "utf8");
  assert(submitRoute.includes('validateCsrfToken("recipe-submit"'), "Recipe submission CSRF check is missing.");
  assert(submitRoute.includes("consumeRateLimit"), "Recipe submission rate limit is missing.");
  assert(submitRoute.includes("validateRecipeDraft"), "Canonical recipe validation is missing from submission.");

  const editorialRoute = await readFile(path.join(root, "src", "pages", "api", "recipes", "[id]", "editorial.ts"), "utf8");
  assert(editorialRoute.includes('validateCsrfToken("recipe-editorial"'), "Recipe editorial CSRF check is missing.");
  assert(editorialRoute.includes('locals.user.role !== "editor"'), "Recipe editorial role check is missing.");
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

console.log(`Validated ${fallbackRecipes.length} recipes, ${fallbackCategories.length} categories, ${markets.length} markets, six D1 migrations, guarded authentication, media, recipe editorial invariants, and browser scripts.`);
