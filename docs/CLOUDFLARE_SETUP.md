# Cloudflare and GitHub CI/CD Setup

The current public application remains D1-free. International discovery, cooking, browser-local planning, saves, offline support, and local recipe drafts work while accounts and trusted writes stay disabled.

Read [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md) for the authoritative state and safety boundary.

## Required Cloudflare services

The future D1 deployment uses:

- Cloudflare Workers and Static Assets;
- Workers KV for verified sessions and lightweight security state;
- private R2 for contributor originals and derivatives;
- Cloudflare Images through the server-side `IMAGES` binding;
- D1 for accounts, media metadata/reservations, recipes, revisions, schedules, private published change sets, and audit events;
- Turnstile for bot verification.

Wrangler may provision draft KV/R2/Images bindings during deployment. D1 is provisioned only through the guarded D1 workflow.

Use a restricted deployment credential with only the permissions required by the selected services and custom domain. Never commit deployment or authentication values.

## GitHub environment and workflows

Use a protected `production` environment with deployment approval and a `main` branch restriction where appropriate.

Current workflows:

- `.github/workflows/ci.yml` — PR validation, all local migrations, and both Worker builds;
- `.github/workflows/deploy.yml` — D1-free deployment from `main`;
- `.github/workflows/enable-d1.yml` — guarded D1 provisioning/migration with trusted writes false;
- `.github/workflows/enable-auth.yml` — guarded sign-in plus independent registration, media, and recipe-write inputs.

Recipe activation verifies media derivatives, scheduling, archive restoration, live published-row isolation, exact change-set base guards, cross-table media reservation, approval-time derivative revalidation, atomic promotion, audit events, and that automatic schedule cron remains disabled.

## D1-free deployment

The automatic production path runs only from `main` and uses `wrangler.jsonc`, which has no D1 binding. Public recipe data comes from the versioned fallback catalogue; account and trusted-write routes fail closed.

Expected health mode:

```json
{
  "ok": true,
  "runtime": "cloudflare-workers",
  "dataMode": "static-fallback"
}
```

## Guarded D1 deployment

The **Enable D1 and Deploy** workflow requires exact manual confirmation and performs the equivalent of:

```bash
npm ci
npm run validate
npm run build:d1
wrangler deploy --config wrangler.d1.jsonc
wrangler d1 migrations apply DB --remote --config wrangler.d1.jsonc
wrangler deploy --config wrangler.d1.jsonc
```

The initial deployment provisions the binding, migrations run in authoritative order, and the final D1-mode Worker still keeps every trusted-write flag false.

## Authoritative migration layout

```text
migrations/d1/0001_initial/migration.sql
migrations/d1/0002_seed/migration.sql
migrations/d1/0003_market_coverage/migration.sql
migrations/d1/0004_auth_accounts/migration.sql
migrations/d1/0005_media_pipeline/migration.sql
migrations/d1/0006_recipe_editorial/migration.sql
migrations/d1/0007_recipe_revisions/migration.sql
migrations/d1/0008_media_derivatives/migration.sql
migrations/d1/0009_recipe_publication_workflow/migration.sql
migrations/d1/0010_published_recipe_change_sets/migration.sql
```

Wrangler applies only the nested sequence selected by:

```jsonc
"migrations_pattern": "migrations/d1/*/migration.sql"
```

Root-level SQL files remain legacy references.

## Fail-closed D1 configuration

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false",
"MEDIA_UPLOADS_ENABLED": "false",
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

Do not edit these defaults to activate production. The guarded workflow creates runner-only temporary configuration for intentional activation.

## Staged activation order

1. Apply all ten migrations with every trusted-write flag false.
2. Verify D1/KV/private-R2/Images readiness through `/api/health`.
3. Configure approved authentication and bot-verification values.
4. Enable controlled sign-in while registration, media, and recipe writes remain false.
5. Provision controlled contributor/editor/admin accounts.
6. Execute the complete media derivative acceptance and rollback matrix.
7. Enable media uploads only in controlled runtime configuration.
8. Test initial submission, requested corrections, owner resubmission, immediate/scheduled publication, due processing, archive/restore, private published change sets, media reservations, concurrency, and rollback.
9. Enable recipe writes only while media remains enabled.
10. Approve legal and verification-delivery operations.
11. Enable public registration separately and last.

See [`D1_AUTH_SETUP.md`](D1_AUTH_SETUP.md).

## Publication scheduling boundary

Migration `0009_recipe_publication_workflow` adds schedule, archive/restore, and publication audit metadata. A scheduled recipe remains private in `review` until guarded promotion succeeds.

The current implementation provides an editor/admin-only manual processor:

```text
POST /api/recipes/scheduled/process
```

It requires same-origin and purpose/session CSRF checks and revalidates recipe revision, complete content, approved media, source checksum, derivative policy, and required formats in the final D1 update.

No Cloudflare Cron Trigger or queue consumer is configured. Health and activation require `automaticScheduleCronConfigured=false`.

## Published change-set boundary

Migration `0010_published_recipe_change_sets` adds private baseline/proposal storage, exact base revisions, active media reservations, and immutable audit events.

- Contributor/editor pages and APIs remain private and no-store.
- Drafting and review never alter the live `published` row.
- Approval runs only through the guarded Worker endpoint; there is no direct browser-to-D1 access.
- Approval-time D1 conditions repeat live base, ownership, media approval, source checksum, derivative policy, and mandatory format checks.
- A temporary `revision_write_token` guards scalar and normalized relational promotion in one D1 batch.
- Cross-table triggers prevent proposed media from being assigned to another recipe or deleted while active.
- No automatic change-set merge, scheduled approval, or external queue consumer is configured.

See [`PUBLISHED_RECIPE_CHANGE_SETS.md`](PUBLISHED_RECIPE_CHANGE_SETS.md).

## Privacy-safe media boundary

- Originals and derivatives are stored in private R2.
- The `IMAGES` binding performs server-side transformations only.
- `/media` never serves original bytes.
- Public delivery requires uploaded/approved parent state and complete current JPEG/WebP derivatives.
- Private previews remain derivative-only and `private, no-store`.
- Live recipes and active change sets reserve media in D1; reserved assets cannot be deleted or assigned elsewhere.

Use synthetic fixtures from [`MEDIA_DERIVATIVE_TEST_MATRIX.md`](MEDIA_DERIVATIVE_TEST_MATRIX.md) before enabling uploads.

## Rollback

- Redeploy `wrangler.jsonc` to return to the D1-free application.
- Redeploy checked-in D1 configuration to close all trusted-write flags.
- Disable recipe writes to close initial submission, corrections, publication, scheduling, archive/restore, and all published change-set operations without deleting stored rows.
- Existing approved derivatives and published recipes remain readable through current public gates.
- Applied migrations are additive history and should not be manually removed.

## Production verification

Before any trusted-write activation:

1. Confirm all ten nested migrations are applied.
2. Confirm health reports expected capabilities without exposing secrets/private content.
3. Confirm checked-in flags remain false.
4. Confirm authentication, lockout, revocation, and hostname restrictions.
5. Confirm media validation, derivative privacy, ETag/checksum, moderation, cleanup, and reservation behavior.
6. Confirm ownership and optimistic/atomic recipe protections.
7. Confirm scheduling revision guards and due-time media revalidation.
8. Confirm archive restoration returns only to private review.
9. Confirm private published change-set save/review does not alter public rows.
10. Confirm stale base or media conflicts reject approval without partial normalized changes.
11. Confirm automatic cron remains absent unless separately reviewed.
12. Confirm legal, retention, moderation, appeal, and deletion procedures are approved.

No deployment, D1 activation, account provisioning, content operation, or production change was performed while updating this document.
