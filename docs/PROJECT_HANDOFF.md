# Ozzyl Recipes Project Handoff

Authoritative continuation summary for `rahmatullahboss/Recipe`, branch `feat/cloudflare-recipe-foundation`, pull request `#1`.

Always fetch current PR metadata and the current blob SHA immediately before updating an existing file.

## Repository state

- Repository: `rahmatullahboss/Recipe`
- Branch: `feat/cloudflare-recipe-foundation`
- Pull request: `#1`
- PR remains open and unmerged.
- Acceptance harness head `9ca7fbb5c7896dcafa0ae796e0a14da062c8807f` passed CI run `#390`.
- Documentation commits followed; verify CI on the exact final head.

## Checked-in boundary

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false",
"MEDIA_UPLOADS_ENABLED": "false",
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

The public application remains D1-free. No deployment, D1 activation, account provisioning, real upload, real recipe/change-set/private-rebase operation, moderation, publication, merge, or production change was performed.

## Completed foundation

- Astro 7 SSR on Cloudflare Workers
- Ten-market D1-free fallback catalogue
- Market-aware discovery/search/taxonomy and Recipe structured data
- Serving conversion, print/copy, saves, shopping list, meal plan, guided cooking, PWA, and offline support
- Guarded D1 authentication and verified-active KV sessions
- Purpose-bound CSRF, same-origin checks, rate limits, Turnstile, lockout, consent, and audit events
- Private R2 originals and `recipe-images-v1` derivatives
- Orientation normalization, metadata scanning, checksums/ETags, deterministic keys, generation leases, cleanup, and approved derivative-only public delivery
- Atomic initial submission and owner correction
- Immediate/scheduled publication, guarded manual due processing, archive, and restore-to-review
- No automatic Cron or queue processor

## Published-recipe private proposals

### Migration `0010_published_recipe_change_sets`

Provides one active private proposal per published recipe, exact base recipe/content revisions, private baseline/proposed JSON, contributor create/save/submit/cancel/requested-change flow, proposed-media reservation, editorial review, approval-time content/media/derivative revalidation, immutable events, and `revision_write_token` guarded atomic live promotion.

Drafting, review, requested changes, and cancellation never modify the live published recipe.

### Migration `0011_editor_change_set_origins`

Provides immutable editor-origin metadata for current-live proposals and historical restoration from recipe revision snapshots or approved change-set baseline/proposed JSON.

Current live content always becomes the new baseline. Historical content becomes only private proposed JSON. Origin-backed drafts are editor-controlled and contributor read-only until review/requested changes. Editors can select only eligible contributor-owned media.

### Migration `0012_recipe_change_set_rebases`

Provides immutable `recipe_change_set_rebases` audit rows containing strategy version, actors, previous/resulting private revisions and bases, classification counts, explicit choices, and previous baseline/current live/previous proposal/resulting proposal JSON.

D1 rejects audit updates and rejects audit insertion when the stored result does not match the resulting private change-set state.

## Three-way conflict behavior

The service compares:

```text
stored baseline
actual current normalized live recipe
private proposed recipe
```

Classifications:

```text
unchanged
proposal_only
live_only
same_change
conflict
```

Rules:

- proposal-only keeps proposed content;
- live-only keeps current live content;
- unchanged/same-change keeps current live content;
- every true conflict requires explicit `live` or `proposed` selection;
- categories are compared as a set;
- categories, ingredients, and directions remain atomic units;
- owner controls contributor drafts and requested changes;
- editor/admin controls origin-backed editor drafts;
- review is read-only and cannot be rebased;
- stale approval remains blocked by the existing exact-base approval service.

`POST /api/recipe-change-sets/:id/rebase` requires verified identity, same-origin and CSRF checks, limits, optimistic revision, current controller, live published status, stale base, canonical content/categories, and eligible owner media with current derivatives and no reservation conflict.

A successful rebase updates only private base/proposal state and immutable audit evidence. It never changes public recipe content or status.

## Executable local conflict acceptance

Command:

```bash
npm ci
npm run db:migrate:local
npm run test:conflicts
```

Files:

- `scripts/cloudflare-test-loader.mjs`
- `scripts/register-cloudflare-test-loader.mjs`
- `scripts/test-recipe-change-set-conflicts.mjs`
- `docs/LOCAL_CONFLICT_ACCEPTANCE.md`

The test imports the production comparator with an empty test Cloudflare binding and verifies all classifications, category-order set equality, atomic ingredient/direction comparisons, immutable snapshots, and fourteen unchanged units for identical drafts.

After all twelve migrations, it creates random temporary local D1 fixtures and verifies:

- mismatched audit/private state is rejected;
- matching state is accepted;
- strategy, revisions, counts, and before/live/after JSON are stored;
- immutable audit updates are rejected;
- rejected updates leave stored audit unchanged;
- all fixture rows are cleaned up.

The script uses only local Wrangler D1 commands. CI runs it after migrations and before both Worker builds. Failed acceptance stores a short-lived diagnostic artifact and fails the job.

This is comparator/schema acceptance only. Worker session, CSRF, roles, rate limits, real D1 batch behavior, KV, R2, Images, media moderation, concurrent HTTP requests, and rollback still require controlled non-production runtime acceptance.

## Private surfaces

- `/account/submissions/:id/change-set`
- `/account/change-sets/:id/conflicts`
- `/admin/recipe-change-sets`
- `/admin/recipe-change-sets/:id`
- `/admin/recipes/:id/change-set`
- `POST /api/recipes/:id/change-set`
- `POST /api/recipes/:id/editor-change-set`
- `POST /api/recipe-change-sets/:id/rebase`
- `POST /api/recipe-change-sets/:id/editorial`

Private pages and APIs remain no-store/noindex where applicable.

## Authoritative migration chain

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
migrations/d1/0011_editor_change_set_origins/migration.sql
migrations/d1/0012_recipe_change_set_rebases/migration.sql
```

Wrangler applies only this nested sequence. Root SQL files remain legacy references.

## Validation evidence

Acceptance harness head `9ca7fbb5c7896dcafa0ae796e0a14da062c8807f` passed CI run `#390` with:

- locked dependency installation;
- security/conflict validation;
- operational browser-script validation;
- all twelve fresh local migrations;
- production comparator fixtures;
- local D1 audit mismatch/immutability checks;
- D1-free Worker build;
- D1 Worker build.

Verify CI again after documentation changes.

## Documentation

- `README.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/D1_AUTH_SETUP.md`
- `docs/PUBLISHED_RECIPE_CHANGE_SETS.md`
- `docs/EDITOR_RECIPE_CHANGE_SETS.md`
- `docs/RECIPE_CHANGE_SET_CONFLICTS.md`
- `docs/LOCAL_CONFLICT_ACCEPTANCE.md`

## Recommended next work

1. Controlled non-production Worker/KV/R2/Images acceptance for authentication, media, submissions, scheduling, restoration, contributor/editor proposals, private rebases, concurrency, and rollback.
2. Review conflict capability checks before any trusted-write activation.
3. Add optional Cron/queue execution only after manual processor acceptance.
4. Approve legal, retention, moderation, and incident procedures.
5. Add account lifecycle and synchronized kitchen/community features.
6. Add taxonomy/localization/nutrition administration, indexing, recommendations, analytics, and advertising controls.

## Continuation rules

1. Use connected GitHub data.
2. Fetch PR `#1` and current blob SHAs before writing.
3. Keep all four checked-in flags false.
4. Do not deploy, activate, provision, upload, moderate, create/restore/revise/rebase/schedule/publish real content, merge, or change production without an explicit request.
5. Preserve ownership, published-only reads, derivative privacy, checksums/ETags, generation leases, media reservations, schedule revisions, exact base guards, immutable origins/rebases, explicit conflict choices, controller boundaries, and atomic D1 safety.
6. Verify CI on the final head.
