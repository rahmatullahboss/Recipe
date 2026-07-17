# Ozzyl Recipes

Ozzyl Recipes is an original international recipe discovery, cooking, planning, contributor, and guarded publishing platform built with Astro 7 and Cloudflare Workers.

The initial audience focus covers the United States, Canada, the United Kingdom, Australia, New Zealand, France, Germany, Switzerland, Sweden, and the Netherlands. The project does not copy Allrecipes branding, source code, copyrighted recipe content, or its exact interface.

For authoritative continuation context, read [`docs/PROJECT_HANDOFF.md`](docs/PROJECT_HANDOFF.md).

## Current deployment boundary

The checked-in public deployment remains D1-free. Public discovery, cooking, planning, browser-local saves, and the local recipe editor work without enabling trusted writes.

The D1 configuration keeps all trusted-write surfaces closed:

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false",
"MEDIA_UPLOADS_ENABLED": "false",
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

No production D1 activation, account provisioning, contributor upload, recipe submission/publication, moderation decision, deployment, merge, or production change was performed by this branch work.

## Implemented capabilities

### International discovery

- Cloudflare country detection with persistent manual market selection
- D1-free fallback catalogue covering ten initial markets
- Market, category, and cuisine landing pages
- Search/API filtering by keyword, ingredient, taxonomy, difficulty, total time, and sorting
- Shared filtering behavior across fallback and future D1 reads
- Recipe structured data, sitemap, robots, and real 404 responses

### Cooking, planning, and offline tools

- Serving scaling and approximate US/metric conversion
- Print, copy-link, and original-measurement modes
- Browser-local saved recipes, shopping list, and seven-day meal plan
- Guided cooking with progress, timers, keyboard controls, and supported wake lock
- PWA manifest, service worker, offline fallback, and private/API/media cache exclusions

### Guarded authentication

- Case-insensitive D1 identities and account lifecycle states
- PBKDF2-HMAC-SHA256 with 600,000 iterations, unique salt, and server-only pepper
- Verified-active-only Workers KV sessions and production `__Host-` cookie
- D1 `auth_version` session revocation
- Purpose-bound signed CSRF, same-origin checks, KV rate limits, Turnstile verification, lockout, verification token digests, consent, OAuth extension, and privacy-preserving audit events
- Independent sign-in and public-registration flags

### Guarded private media and privacy-safe derivatives

- One-time D1 upload intents and server-generated private R2 original keys
- JPEG/PNG/WebP validation, 8 MiB limit, dimensions, 40 MP cap, signature/MIME/size/checksum checks
- EXIF orientation parsing and normalized dimensions
- `recipe-images-v1` widths at 320/640/960/1280 without upscaling
- Required JPEG/WebP and optional exact-MIME AVIF through 960 px
- Generated-byte metadata scanners
- D1 generation leases, deterministic policy/checksum R2 keys, output checksums, and ETags
- Original objects never served by `/media`
- Owner/editor derivative previews with `private, no-store`
- Public delivery only for uploaded, approved parents with complete current derivatives
- Guarded regeneration, rejection/quarantine/deletion cleanup, and immutable public caching

### Contributor submissions and requested changes

- Browser-autosaved new-recipe editor
- Protected atomic first submission into private `review`
- Public D1 reads restricted to `published`
- Editor/admin publish, request-changes, and archive actions
- Owner-only `review → draft → review` correction workflow
- Separate optimistic `revision` and `content_revision`
- Unique temporary `revision_write_token` guarding relational replacement
- Immutable `recipe_revision_snapshots`
- Final publication update rechecks approved media and current derivative readiness

### Scheduled publishing and archive restoration

Migration `0009_recipe_publication_workflow` adds a guarded publication lifecycle:

- Future UTC schedule/replace and cancellation
- Schedule ownership and `schedule_revision` optimistic guard
- Immediate publication and due scheduled publication through the same final media/content gates
- Editor/admin-only manual due processor at `POST /api/recipes/scheduled/process`
- Deterministic due ordering and per-recipe atomic promotion
- Archive timestamps and `archived → review` restoration
- Restoration never republishes directly
- Separate `recipe_publication_events` audit history
- Health diagnostics for schedule, processor, revision/media revalidation, and atomic promotion
- Automatic Cron Trigger intentionally not configured

See [`docs/RECIPE_PUBLICATION_WORKFLOW.md`](docs/RECIPE_PUBLICATION_WORKFLOW.md).

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

Wrangler applies only:

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
```

`wrangler.d1.jsonc` restricts migrations with:

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
npm run build
npm run build:d1
```

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
- `/api/auth/*`
- `/api/media/intents`, `/api/media/upload`, `/api/media/mine`
- `POST /api/media/:id/derivatives`
- `DELETE /api/media/:id`
- `/api/recipes/submissions`
- `/api/recipes/:id/resubmit`

### Editorial and media operations

- `/admin/media`
- `/admin/recipes`
- `/admin/recipes/:id`
- `/api/media/:id/moderate`
- `/api/recipes/:id/editorial`
- `POST /api/recipes/scheduled/process`
- `/media/:key`

Private account, contributor, admin, media-write, submission, revision, editorial, and schedule-processing routes receive no-store/noindex protections where appropriate.

## Guarded workflows

- CI validates the catalogue, nine migrations, security invariants, browser scripts, local migration chain, and both Worker builds.
- D1-free deployment occurs from `main` only.
- D1 provisioning requires exact `ENABLE_D1` confirmation while trusted writes remain disabled.
- Authentication activation requires exact `ENABLE_AUTH` and independently controls registration, media, and recipe submissions.
- Recipe submissions require media uploads.
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

## Validation baseline

Implementation head `15fa2ce2f2ac6aa2c823585075ed19d368b94d1f` passed GitHub Actions CI run `#310`, including dependency installation, project validation, all nine local migrations, operational-script validation, D1-free Worker build, and D1 Worker build. Documentation commits may move the branch head; always recheck PR `#1` before continuing.

## Remaining phases

1. Execute controlled non-production runtime acceptance for account, media, derivative, submission, revision, schedule, archive/restore, and rollback matrices.
2. Approve legal, retention, moderation, incident, and verification-email operations.
3. Provision controlled administrator/editor accounts.
4. Add contributor revisions of already published recipes through private change sets that preserve the live published row until atomic promotion.
5. Add editorial content editing, snapshot restore, automatic Cron/queue scheduling, and richer conflict resolution.
6. Add synchronized kitchen/community features and account lifecycle interfaces.
7. Add nutrition/taxonomy/localization administration, search indexing, recommendations, analytics, and advertising controls.
