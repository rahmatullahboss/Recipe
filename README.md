# Ozzyl Recipes

Ozzyl Recipes is an original international recipe discovery, cooking, planning, contributor, and guarded publishing platform built with Astro 7 and Cloudflare Workers.

The initial audience focus covers the United States, Canada, the United Kingdom, Australia, New Zealand, France, Germany, Switzerland, Sweden, and the Netherlands. The project does not copy Allrecipes branding, source code, copyrighted recipe content, or its exact interface.

For authoritative continuation context, read [`docs/PROJECT_HANDOFF.md`](docs/PROJECT_HANDOFF.md).

## Current deployment boundary

The checked-in public deployment remains D1-free. Public discovery, cooking, planning, browser-local saves, and the local recipe editor work without enabling trusted writes.

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false",
"MEDIA_UPLOADS_ENABLED": "false",
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

No production D1 activation, account provisioning, contributor upload, recipe creation, change-set operation, historical restoration, private rebase, moderation decision, scheduling, publication, deployment, merge, or production change was performed by this branch work.

## Implemented capabilities

### International discovery and kitchen tools

- Cloudflare country detection with persistent market selection
- D1-free fallback catalogue covering ten initial markets
- Market/category/cuisine pages, search/API filters, Recipe structured data, sitemap, robots, and real 404s
- Serving scaling, approximate US/metric conversion, print, copy link, saves, shopping list, meal plan, and guided cooking
- PWA manifest, service worker, offline fallback, and private/API/media cache exclusions

### Guarded authentication

- Case-insensitive D1 identities and account lifecycle states
- PBKDF2-HMAC-SHA256 with 600,000 iterations, unique salt, and server-only pepper
- Verified-active-only Workers KV sessions and production `__Host-` cookie
- D1 `auth_version` session revocation
- Purpose-bound CSRF, same-origin checks, rate limits, Turnstile, lockout, verification token digests, consent, OAuth extension, and privacy-preserving audit events
- Independent sign-in, registration, media, and recipe-write flags

### Private media and privacy-safe derivatives

- One-time D1 upload intents and server-generated private R2 original keys
- JPEG/PNG/WebP validation, 8 MiB limit, dimensions, 40 MP cap, signature/MIME/size/checksum checks, and SVG rejection
- EXIF orientation parsing and normalized dimensions
- `recipe-images-v1` widths at 320/640/960/1280 without upscaling
- Required JPEG/WebP and optional exact-MIME AVIF through 960 px
- Generated metadata scanners, D1 generation leases, deterministic checksum/policy keys, output checksums, and ETags
- Original objects never served by `/media`
- Owner/editor derivative previews with `private, no-store`
- Public delivery only for uploaded, approved parents with complete current derivatives
- Guarded regeneration, media reservations, rejection/quarantine/deletion cleanup, and immutable public caching

### Submission, correction, publication, and restoration

- Browser-autosaved new-recipe editor
- Atomic initial submission into private `review`
- Public D1 reads restricted to `published`
- Editor/admin publish, request-changes, scheduling, archive, and restore-to-review actions
- Owner-only `review → draft → review` correction workflow
- Separate optimistic `revision` and `content_revision`
- Unique temporary `revision_write_token` guarding normalized relational replacement
- Immutable `recipe_revision_snapshots`
- Immediate and due scheduled publication through repeated content/media/derivative gates
- Editor/admin manual due processor; no automatic Cron Trigger
- `archived → review` restoration that never republishes directly

See [`docs/RECIPE_EDITORIAL.md`](docs/RECIPE_EDITORIAL.md) and [`docs/RECIPE_PUBLICATION_WORKFLOW.md`](docs/RECIPE_PUBLICATION_WORKFLOW.md).

### Private contributor updates to published recipes

Migration `0010_published_recipe_change_sets` provides:

- at most one active private change set per published recipe;
- private baseline and proposed full recipe JSON;
- exact base recipe/content revision guards;
- contributor create, save, submit, withdraw, and requested-change loop;
- active proposed-media reservation across recipes and change sets;
- editor/admin baseline-versus-proposal review;
- approval-time category, ownership, media, checksum, policy, and derivative revalidation;
- `revision_write_token` guarded replacement of live categories, ingredients, and directions;
- one atomic promotion that keeps status `published` and increments live recipe/content revisions;
- immutable `recipe_change_set_events`;
- unchanged public live rows during drafting and review.

See [`docs/PUBLISHED_RECIPE_CHANGE_SETS.md`](docs/PUBLISHED_RECIPE_CHANGE_SETS.md).

### Editor-authored proposals and historical restoration

Migration `0011_editor_change_set_origins` adds immutable source metadata for editor-authored private proposals.

Editors can:

- start from the current normalized published recipe;
- restore a `recipe_revision_snapshots` entry into a new private proposal;
- restore the proposed or baseline JSON of an already approved change set;
- edit only an origin-backed editor-controlled draft;
- select only eligible media already owned by the recipe contributor;
- save privately or submit into the same independent review queue;
- cancel the private draft without changing the live recipe.

The current live recipe always becomes the new baseline. Historical content becomes only proposed JSON. Invalid historical media falls back to current eligible owner media when possible and records that decision in immutable origin metadata. If no eligible media exists, the draft can be saved but not submitted.

Contributor API and UI independently block writes to an editor-controlled `draft`. After a reviewer requests changes, the contributor controls the existing correction editor. Approval reuses the same atomic promotion implementation as contributor-authored proposals.

See [`docs/EDITOR_RECIPE_CHANGE_SETS.md`](docs/EDITOR_RECIPE_CHANGE_SETS.md).

### Audited three-way conflict assistance

Migration `0012_recipe_change_set_rebases` adds immutable private-rebase history.

A stale proposal is compared as:

```text
stored baseline
current live published recipe
private proposed recipe
```

Each scalar/media/collection unit is classified as unchanged, proposal-only, live-only, same-change, or conflict. Proposal-only changes are retained, live-only changes use the current live value, equal changes collapse safely, and every real conflict requires an explicit live/proposed choice.

Categories, ingredients, and directions are atomic units; the system does not perform unsafe item-level list merging. A guarded D1 batch updates only private baseline/proposal state and inserts immutable before/live/after audit snapshots. Rebase never approves or changes public content, and stale approval remains blocked until the rebased proposal returns through independent review.

The local acceptance command imports the production comparator and exercises deterministic classifications plus the migrated D1 rebase-audit mismatch and immutability triggers. It uses only local Wrangler state and synthetic temporary rows.

See [`docs/RECIPE_CHANGE_SET_CONFLICTS.md`](docs/RECIPE_CHANGE_SET_CONFLICTS.md) and [`docs/LOCAL_CONFLICT_ACCEPTANCE.md`](docs/LOCAL_CONFLICT_ACCEPTANCE.md).

## Cloudflare architecture

| Concern | Implementation |
| --- | --- |
| Frontend and SSR | Astro 7 on Cloudflare Workers |
| Static assets | Workers Static Assets |
| Current public data | Versioned TypeScript fallback catalogue |
| Relational recipe/account data | Cloudflare D1 |
| Sessions and lightweight security state | Workers KV |
| Private originals and derivatives | Cloudflare R2 |
| Server-side image transforms | Cloudflare Images binding |
| Bot protection | Turnstile |
| Verification delivery | Authenticated HTTPS webhook |
| CI/CD | GitHub Actions and Wrangler Action v4 |

## Authoritative D1 migrations

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

Wrangler applies only the nested sequence selected by:

```jsonc
"migrations_pattern": "migrations/d1/*/migration.sql"
```

Root-level SQL files are legacy references and are outside Wrangler's execution path.

## Local commands

Requirements: Node.js 22 or newer. CI uses Node.js 24.

```bash
npm ci
npm run validate
npm run dev
npm run db:migrate:local
npm run test:conflicts
npm run build
npm run build:d1
```

`npm run test:conflicts` requires the local migrations first. It never uses `--remote` D1 access.

Keep all trusted-write flags false unless a deliberate controlled activation procedure is being executed.

## Important routes

### Public and browser-local

- `/`, `/search`
- `/markets`, `/markets/:country`
- `/categories`, `/categories/:slug`
- `/recipes/:slug`, `/recipes/:slug/cook`
- `/saved`, `/shopping-list`, `/meal-plan`, `/offline`
- `/api/recipes`, `/api/recipes/validate`, `/api/health`

### Account and contributor

- `/login`, `/register`, `/verify-email`, `/account`
- `/recipes/new`
- `/account/submissions`
- `/account/submissions/:id/edit`
- `/account/submissions/:id/change-set`
- `/account/change-sets/:id/conflicts`
- `/api/auth/*`
- `/api/media/intents`, `/api/media/upload`, `/api/media/mine`
- `POST /api/media/:id/derivatives`
- `DELETE /api/media/:id`
- `/api/recipes/submissions`
- `/api/recipes/:id/resubmit`
- `POST /api/recipes/:id/change-set`
- `POST /api/recipe-change-sets/:id/rebase`

### Editorial and media operations

- `/admin/media`
- `/admin/recipes`, `/admin/recipes/:id`
- `/admin/recipe-change-sets`, `/admin/recipe-change-sets/:id`
- `/admin/recipes/:id/change-set`
- `/api/media/:id/moderate`
- `/api/recipes/:id/editorial`
- `POST /api/recipes/scheduled/process`
- `POST /api/recipe-change-sets/:id/editorial`
- `POST /api/recipes/:id/editor-change-set`
- `/media/:key`

Private account, contributor, admin, media-write, recipe-write, change-set, historical-restore, conflict-rebase, editorial, and schedule-processing routes receive no-store/noindex protections where appropriate.

## Guarded workflows

- CI validates the catalogue, twelve migrations, security invariants, browser scripts, fresh local migration chain, production comparator conflict fixtures, local D1 rebase-audit triggers, and both Worker builds.
- Failed conflict acceptance uploads a three-day `conflict-acceptance-log` artifact before CI fails; successful runs create no artifact.
- D1-free deployment occurs from `main` only.
- D1 provisioning requires exact `ENABLE_D1` confirmation while trusted writes remain disabled.
- Authentication activation requires exact `ENABLE_AUTH` and independently controls registration, media, and recipe writes.
- Recipe writes require media uploads.
- Existing activation checks cover scheduling, restoration, published-row isolation, base guards, media reservation, contributor/editor proposals, historical restore, immutable origins, contributor draft-lock, derivative revalidation, audit events, and atomic promotion.
- Conflict-assistance readiness is exposed through `/api/health` and enforced by CI. The protected activation workflow was not rewritten in this phase because the connector rejected replacing the secret-bearing workflow file.
- No automatic schedule processor is deployed by the checked-in code.

## Documentation

- [`docs/PROJECT_HANDOFF.md`](docs/PROJECT_HANDOFF.md)
- [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md)
- [`docs/CLOUDFLARE_SETUP.md`](docs/CLOUDFLARE_SETUP.md)
- [`docs/D1_AUTH_SETUP.md`](docs/D1_AUTH_SETUP.md)
- [`docs/MEDIA_PIPELINE.md`](docs/MEDIA_PIPELINE.md)
- [`docs/MEDIA_DERIVATIVE_TEST_MATRIX.md`](docs/MEDIA_DERIVATIVE_TEST_MATRIX.md)
- [`docs/MEDIA_DERIVATIVE_ROLLBACK.md`](docs/MEDIA_DERIVATIVE_ROLLBACK.md)
- [`docs/RECIPE_EDITORIAL.md`](docs/RECIPE_EDITORIAL.md)
- [`docs/RECIPE_PUBLICATION_WORKFLOW.md`](docs/RECIPE_PUBLICATION_WORKFLOW.md)
- [`docs/PUBLISHED_RECIPE_CHANGE_SETS.md`](docs/PUBLISHED_RECIPE_CHANGE_SETS.md)
- [`docs/EDITOR_RECIPE_CHANGE_SETS.md`](docs/EDITOR_RECIPE_CHANGE_SETS.md)
- [`docs/RECIPE_CHANGE_SET_CONFLICTS.md`](docs/RECIPE_CHANGE_SET_CONFLICTS.md)
- [`docs/LOCAL_CONFLICT_ACCEPTANCE.md`](docs/LOCAL_CONFLICT_ACCEPTANCE.md)

## Validation baseline

Acceptance harness head `9ca7fbb5c7896dcafa0ae796e0a14da062c8807f` passed GitHub Actions CI run `#390`, including locked dependency installation, conflict/security validation, all twelve fresh local D1 migrations, production comparator fixtures, local D1 rebase-audit mismatch/immutability checks, D1-free Worker build, and D1 Worker build. Documentation commits may move the branch head; always recheck PR `#1` before continuing.

## Remaining phases

1. Execute controlled non-production Worker/KV/R2/Images runtime acceptance for accounts, media, derivatives, submissions, correction, scheduling, archive/restore, contributor/editor change sets, historical restoration, private rebases, concurrency, and rollback.
2. Review and extend protected activation checks for conflict-assistance health fields.
3. Add optional Cloudflare Cron/queue scheduling only after manual processor acceptance and incident procedures.
4. Approve legal, retention, moderation, incident, and verification-email operations.
5. Add synchronized kitchen/community features and account lifecycle interfaces.
6. Add nutrition/taxonomy/localization administration, search indexing, recommendations, analytics, and advertising controls.
