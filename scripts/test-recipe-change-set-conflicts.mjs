import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  RECIPE_THREE_WAY_STRATEGY_VERSION,
  buildRecipeChangeSetThreeWay,
} from "../src/lib/recipe-change-set-conflicts.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getUnit(comparison, key) {
  const unit = comparison.units.find((item) => item.key === key);
  assert.ok(unit, `Missing comparison unit: ${key}`);
  return unit;
}

function testThreeWayClassification() {
  const baseline = {
    title: "Baseline Tomato Pasta",
    summary: "A dependable tomato pasta recipe for busy weeknight dinners.",
    description: "The original private baseline description.",
    mediaAssetId: null,
    countryCode: "US",
    languageCode: "en",
    measurementSystem: "us",
    prepMinutes: 15,
    cookMinutes: 20,
    servings: 4,
    difficulty: "easy",
    categories: ["dinner", "italian"],
    ingredients: [
      { item: "Tomatoes", amount: "2", unit: "cups", note: "chopped" },
      { item: "Pasta", amount: "12", unit: "oz", note: "" },
    ],
    steps: [
      { instruction: "Boil the pasta until it is nearly tender.", timerMinutes: 8 },
      { instruction: "Simmer the sauce and combine it with the pasta.", timerMinutes: 12 },
    ],
  };
  const live = clone(baseline);
  const proposed = clone(baseline);

  proposed.title = "Contributor Tomato Pasta";
  live.summary = "A refreshed live tomato pasta recipe for quick weeknight dinners.";
  live.description = "A shared description selected independently by both sides.";
  proposed.description = live.description;
  live.cookMinutes = 25;
  proposed.cookMinutes = 30;
  live.categories = ["italian", "dinner"];
  live.ingredients[0].amount = "3";
  proposed.ingredients[1].amount = "16";
  proposed.steps = [
    { instruction: "Boil the pasta until it is just tender, then drain it.", timerMinutes: 9 },
    { instruction: "Simmer the sauce, fold in the pasta, and serve immediately.", timerMinutes: 11 },
  ];

  const comparison = buildRecipeChangeSetThreeWay(baseline, live, proposed);

  assert.equal(comparison.strategyVersion, RECIPE_THREE_WAY_STRATEGY_VERSION);
  assert.equal(comparison.strategyVersion, "recipe-three-way-v1");
  assert.equal(getUnit(comparison, "title").state, "proposal_only");
  assert.equal(getUnit(comparison, "summary").state, "live_only");
  assert.equal(getUnit(comparison, "description").state, "same_change");
  assert.equal(getUnit(comparison, "cookMinutes").state, "conflict");
  assert.equal(getUnit(comparison, "categories").state, "unchanged", "Category order must not create a conflict.");
  assert.equal(getUnit(comparison, "ingredients").state, "conflict", "Ingredient lists must be compared as one atomic unit.");
  assert.equal(getUnit(comparison, "steps").state, "proposal_only", "Direction lists must be compared as one atomic unit.");
  assert.deepEqual(comparison.summary, {
    unchanged: 8,
    proposalOnly: 2,
    liveOnly: 1,
    sameChange: 1,
    conflicts: 2,
  });

  const categorySnapshot = getUnit(comparison, "categories").baseline;
  categorySnapshot.push("mutated-test-value");
  assert.deepEqual(baseline.categories, ["dinner", "italian"], "Comparison snapshots must not mutate source drafts.");

  const allUnchanged = buildRecipeChangeSetThreeWay(baseline, clone(baseline), clone(baseline));
  assert.equal(allUnchanged.summary.unchanged, 14);
  assert.equal(allUnchanged.summary.conflicts, 0);
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseWranglerJson(stdout) {
  const trimmed = stdout.trim();
  const candidates = [trimmed];
  const arrayStart = trimmed.indexOf("[");
  const objectStart = trimmed.indexOf("{");
  if (arrayStart >= 0) candidates.push(trimmed.slice(arrayStart));
  if (objectStart >= 0) candidates.push(trimmed.slice(objectStart));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next possible JSON boundary.
    }
  }
  throw new Error(`Wrangler did not return parseable JSON:\n${stdout}`);
}

function executeD1(sql, { expectFailure = false } = {}) {
  const result = spawnSync(
    npxCommand,
    [
      "--no-install",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--config",
      "wrangler.d1.jsonc",
      "--command",
      sql,
      "--json",
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    },
  );

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  if (expectFailure) {
    assert.notEqual(result.status, 0, `Expected local D1 command to fail:\n${sql}\n${output}`);
    return output;
  }
  assert.equal(result.status, 0, `Local D1 command failed:\n${sql}\n${output}`);
  return parseWranglerJson(result.stdout ?? "");
}

function rowsFrom(payload) {
  const entries = Array.isArray(payload) ? payload : [payload];
  return entries.flatMap((entry) => Array.isArray(entry?.results) ? entry.results : []);
}

function testRebaseAuditMigration() {
  const suffix = randomUUID().replaceAll("-", "");
  const userId = `acceptance_user_${suffix}`;
  const recipeId = `acceptance_recipe_${suffix}`;
  const changeSetId = `acceptance_change_${suffix}`;
  const auditId = `acceptance_rebase_${suffix}`;
  const mismatchAuditId = `acceptance_rebase_mismatch_${suffix}`;
  const email = `acceptance-${suffix}@example.invalid`;
  const username = `acceptance_${suffix}`;
  const slug = `acceptance-three-way-${suffix}`;
  const originalBaseline = JSON.stringify({ title: "Baseline" });
  const originalProposal = JSON.stringify({ title: "Proposal" });
  const currentLive = JSON.stringify({ title: "Current live" });
  const resolvedProposal = JSON.stringify({ title: "Resolved proposal" });

  const cleanup = `
    PRAGMA foreign_keys = ON;
    DELETE FROM recipes WHERE id = ${sqlText(recipeId)};
    DELETE FROM users WHERE id = ${sqlText(userId)};
  `;

  try {
    executeD1(cleanup);
    executeD1(`
      PRAGMA foreign_keys = ON;
      INSERT INTO users (
        id, email, username, display_name, role, status, email_verified_at
      ) VALUES (
        ${sqlText(userId)}, ${sqlText(email)}, ${sqlText(username)},
        'Acceptance Editor', 'editor', 'active', CURRENT_TIMESTAMP
      );
      INSERT INTO recipes (
        id, author_id, title, slug, summary, description,
        country_code, language_code, measurement_system,
        prep_minutes, cook_minutes, servings, difficulty,
        status, published_at, revision, content_revision
      ) VALUES (
        ${sqlText(recipeId)}, ${sqlText(userId)}, 'Acceptance Recipe', ${sqlText(slug)},
        'A deterministic local acceptance recipe used only in ephemeral D1 state.',
        'Local migration acceptance fixture.', 'US', 'en', 'us',
        10, 20, 4, 'easy', 'published', CURRENT_TIMESTAMP, 1, 1
      );
      INSERT INTO recipe_change_sets (
        id, recipe_id, owner_id, created_by, status, revision,
        base_recipe_revision, base_content_revision,
        base_content_json, content_json
      ) VALUES (
        ${sqlText(changeSetId)}, ${sqlText(recipeId)}, ${sqlText(userId)}, ${sqlText(userId)},
        'draft', 1, 1, 1, ${sqlText(originalBaseline)}, ${sqlText(originalProposal)}
      );
    `);

    const mismatchOutput = executeD1(`
      INSERT INTO recipe_change_set_rebases (
        id, change_set_id, recipe_id, actor_id,
        previous_change_set_revision, resulting_change_set_revision,
        previous_base_recipe_revision, previous_base_content_revision,
        resulting_base_recipe_revision, resulting_base_content_revision,
        proposal_only_count, live_only_count, same_change_count, conflict_count,
        resolution_json, previous_base_content_json, live_content_json,
        previous_proposed_content_json, resulting_proposed_content_json
      ) VALUES (
        ${sqlText(mismatchAuditId)}, ${sqlText(changeSetId)}, ${sqlText(recipeId)}, ${sqlText(userId)},
        1, 2, 1, 1, 2, 2, 1, 1, 0, 1,
        '{}', ${sqlText(originalBaseline)}, ${sqlText(currentLive)},
        ${sqlText(originalProposal)}, ${sqlText(resolvedProposal)}
      );
    `, { expectFailure: true });
    assert.match(mismatchOutput, /rebase must match the resulting private state/i);

    executeD1(`
      UPDATE recipe_change_sets
      SET revision = 2,
          base_recipe_revision = 2,
          base_content_revision = 2,
          base_content_json = ${sqlText(currentLive)},
          content_json = ${sqlText(resolvedProposal)}
      WHERE id = ${sqlText(changeSetId)} AND revision = 1;
      INSERT INTO recipe_change_set_rebases (
        id, change_set_id, recipe_id, actor_id,
        previous_change_set_revision, resulting_change_set_revision,
        previous_base_recipe_revision, previous_base_content_revision,
        resulting_base_recipe_revision, resulting_base_content_revision,
        proposal_only_count, live_only_count, same_change_count, conflict_count,
        resolution_json, previous_base_content_json, live_content_json,
        previous_proposed_content_json, resulting_proposed_content_json
      ) VALUES (
        ${sqlText(auditId)}, ${sqlText(changeSetId)}, ${sqlText(recipeId)}, ${sqlText(userId)},
        1, 2, 1, 1, 2, 2, 2, 1, 1, 2,
        '{"choices":{"title":"proposed"}}', ${sqlText(originalBaseline)}, ${sqlText(currentLive)},
        ${sqlText(originalProposal)}, ${sqlText(resolvedProposal)}
      );
    `);

    const auditPayload = executeD1(`
      SELECT id, strategy_version, previous_change_set_revision,
             resulting_change_set_revision, resulting_base_recipe_revision,
             resulting_base_content_revision, conflict_count,
             live_content_json, resulting_proposed_content_json
      FROM recipe_change_set_rebases
      WHERE id = ${sqlText(auditId)};
    `);
    const auditRows = rowsFrom(auditPayload);
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0].strategy_version, "recipe-three-way-v1");
    assert.equal(auditRows[0].previous_change_set_revision, 1);
    assert.equal(auditRows[0].resulting_change_set_revision, 2);
    assert.equal(auditRows[0].resulting_base_recipe_revision, 2);
    assert.equal(auditRows[0].resulting_base_content_revision, 2);
    assert.equal(auditRows[0].conflict_count, 2);
    assert.equal(auditRows[0].live_content_json, currentLive);
    assert.equal(auditRows[0].resulting_proposed_content_json, resolvedProposal);

    const immutableOutput = executeD1(`
      UPDATE recipe_change_set_rebases
      SET conflict_count = 99
      WHERE id = ${sqlText(auditId)};
    `, { expectFailure: true });
    assert.match(immutableOutput, /rebase records are immutable/i);

    const unchangedPayload = executeD1(`
      SELECT conflict_count FROM recipe_change_set_rebases WHERE id = ${sqlText(auditId)};
    `);
    assert.equal(rowsFrom(unchangedPayload)[0]?.conflict_count, 2, "Failed immutable update must leave audit unchanged.");
  } finally {
    executeD1(cleanup);
  }
}

function main() {
  testThreeWayClassification();
  testRebaseAuditMigration();
  console.log("Recipe change-set conflict acceptance passed: production comparator classifications and local D1 rebase audit guards are valid.");
}

main();
