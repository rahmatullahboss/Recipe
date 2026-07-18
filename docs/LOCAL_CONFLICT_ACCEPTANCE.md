# Local Three-Way Conflict Acceptance Harness

This local acceptance layer exercises published-recipe conflict safeguards without deploying a Worker, activating trusted writes, provisioning accounts, uploading media, or using production data.

It now contains two complementary suites:

1. production comparator plus local D1 schema/trigger acceptance;
2. production authentication plus rebase request-handler guard acceptance.

## Comparator and D1 command

Apply the authoritative local migration chain first, then run:

```bash
npm ci
npm run db:migrate:local
npm run test:conflicts
```

CI runs this suite after all twelve migrations.

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

The comparator/schema suite uses Wrangler's local D1 state after the authoritative migration chain has been applied.

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

## Rebase request-handler command

Run the companion request-handler suite with:

```bash
node --experimental-transform-types \
  --import ./scripts/register-cloudflare-test-loader.mjs \
  scripts/test-recipe-change-set-rebase-route.mjs
```

This suite executes the production `src/lib/auth.ts` and production rebase API handler with synthetic in-memory bindings. Only the database-changing rebase service boundary is stubbed.

It verifies verified-session creation and hydration, `auth_version` revocation, suspended-account invalidation, Origin/Referer checks, purpose/session CSRF, content type and size limits, identifier/JSON/revision/resolution validation, rate limiting, service status mapping, generic failure handling, exact success delegation, and `private, no-store` responses.

See [`REBASE_ROUTE_ACCEPTANCE.md`](REBASE_ROUTE_ACCEPTANCE.md) for the full request-handler matrix and explicit limitations.

## CI behavior

The CI order is:

```text
project validator
browser/operational script validation
all twelve local D1 migrations
three-way comparator and D1 audit acceptance
rebase authentication/request-handler acceptance
D1-free Worker build
D1 Worker build
```

Comparator/schema failures upload:

```text
conflict-acceptance-log
```

Request-handler failures upload:

```text
rebase-route-acceptance-log
```

Both artifacts are retained for three days and the job then fails. Successful suites create no diagnostic artifact.

## What this does not prove

These suites do not replace controlled runtime acceptance. They do not execute:

- a real deployed or local Worker HTTP server;
- contributor/editor role resolution from a real D1 account through middleware;
- real D1 `batch()` behavior for the rebase service;
- remote KV consistency behavior;
- R2 originals or derivative objects;
- Cloudflare Images transformations;
- media checksum, moderation, or derivative regeneration against real bindings;
- concurrent browser requests;
- actual private rebase writes;
- real editorial approval or publication;
- protected activation workflows;
- production rollback.

Those remain controlled non-production runtime tests and must use synthetic accounts, recipes, and media only.

## Safety boundary

The comparator/schema test uses local Wrangler D1 state only. The request-handler test uses synthetic in-memory bindings and a service stub. Checked-in trusted-write flags remain false:

```text
AUTH_ENABLED=false
AUTH_REGISTRATION_ENABLED=false
MEDIA_UPLOADS_ENABLED=false
RECIPE_SUBMISSIONS_ENABLED=false
```

Do not point either harness at remote Cloudflare resources. The comparator script intentionally contains only `--local` Wrangler commands, and the route suite has no remote bindings.
