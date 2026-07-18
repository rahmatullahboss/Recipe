# Local Three-Way Conflict Acceptance Harness

This harness exercises published-recipe conflict safeguards without deploying a Worker, activating trusted writes, provisioning accounts, uploading media, or using production data.

## Command

Apply the authoritative local migration chain first, then run:

```bash
npm ci
npm run db:migrate:local
npm run test:conflicts
```

CI runs the same acceptance command after all twelve migrations and before either Worker build.

## Production comparator coverage

The test imports `buildRecipeChangeSetThreeWay` directly from:

```text
src/lib/recipe-change-set-conflicts.ts
```

A test-only Node loader:

- provides an empty `cloudflare:workers` environment binding;
- resolves the project's extensionless local TypeScript imports;
- does not replace or copy the comparator implementation;
- does not provide D1, KV, R2, Images, session, or authentication behavior.

The deterministic fixture verifies:

- strategy version `recipe-three-way-v1`;
- `proposal_only` classification;
- `live_only` classification;
- `same_change` classification;
- true `conflict` classification;
- unchanged scalar classification;
- category order does not create a false conflict;
- categories are compared as a set;
- ingredients remain one atomic comparison unit;
- directions remain one atomic comparison unit;
- comparison snapshots do not mutate source drafts;
- identical baseline/live/proposal content produces fourteen unchanged units and zero conflicts.

## Local D1 migration coverage

The test uses Wrangler's local D1 state after the authoritative migration chain has been applied.

Each run generates random fixture identifiers and creates only:

- one temporary editor user;
- one temporary published recipe;
- one temporary private change set;
- one temporary rebase audit record.

The D1 acceptance verifies:

1. an audit insert is rejected when its resulting revision/base/JSON does not match the private change-set state;
2. a matching private state and audit can be stored;
3. the fixed strategy version is preserved;
4. previous/resulting revisions and base revisions are preserved;
5. conflict counts and before/live/after JSON are preserved;
6. `recipe_change_set_rebases_immutable` rejects audit updates;
7. a rejected audit update leaves the stored record unchanged;
8. fixture recipe deletion cascades private change-set and rebase data;
9. the temporary user and all fixture rows are removed in `finally` cleanup.

No seed recipe or account is modified.

## CI behavior

The CI order is:

```text
project validator
browser/operational script validation
all twelve local D1 migrations
three-way conflict acceptance
D1-free Worker build
D1 Worker build
```

If the acceptance command fails, CI stores `conflict-acceptance.log` as a short-lived artifact named:

```text
conflict-acceptance-log
```

The artifact is retained for three days and the job then fails. Successful runs do not create the artifact.

## What this does not prove

This harness does not replace controlled runtime acceptance. It does not execute:

- HTTP session authentication;
- same-origin or CSRF request handling;
- contributor/editor role resolution through a running Worker;
- rate limits;
- real D1 `batch()` behavior through the Worker runtime;
- R2 originals or derivative objects;
- Cloudflare Images transformations;
- media checksum, moderation, or derivative regeneration against real bindings;
- concurrent browser requests;
- real editorial approval or publication;
- protected activation workflows;
- production rollback.

Those remain controlled non-production runtime tests and must use synthetic accounts, recipes, and media only.

## Safety boundary

The test command uses local Wrangler state only. Checked-in trusted-write flags remain false:

```text
AUTH_ENABLED=false
AUTH_REGISTRATION_ENABLED=false
MEDIA_UPLOADS_ENABLED=false
RECIPE_SUBMISSIONS_ENABLED=false
```

Do not point this harness at a remote D1 database. The script intentionally contains only `--local` Wrangler commands.
