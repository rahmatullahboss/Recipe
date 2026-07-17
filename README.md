# Ozzyl Recipes

Ozzyl Recipes is an original international recipe discovery, cooking, planning, contributor, and guarded publishing platform built with Astro 7 and Cloudflare Workers.

The initial audience focus covers the United States, Canada, the United Kingdom, Australia, New Zealand, France, Germany, Switzerland, Sweden, and the Netherlands. The project does not copy Allrecipes branding, source code, copyrighted recipe content, or its exact interface.

For complete continuation context, read [`docs/PROJECT_HANDOFF.md`](docs/PROJECT_HANDOFF.md).

## Current deployment boundary

The checked-in public deployment remains D1-free. Public discovery, cooking, planning, browser-local saves, and the local recipe editor work without enabling trusted writes.

The future D1 configuration keeps all trusted write surfaces closed:

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false",
"MEDIA_UPLOADS_ENABLED": "false",
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

No production D1 activation, account provisioning, contributor upload, recipe submission, moderation decision, publication, deployment, or merge has been performed by this branch work.

## Implemented capabilities

### International discovery

- Cloudflare country detection with persistent manual market selection
- D1-free fallback catalogue with initial coverage for ten markets
- Market, category, and cuisine landing pages
- Search and JSON API filtering by keyword, ingredient, market, taxonomy, difficulty, total time, and sorting
- Shared filtering behavior across static fallback and future D1 reads
- Schema.org Recipe metadata, sitemap, robots, and real 404 responses

### Cooking and private kitchen tools

- Serving scaling
- Approximate US/metric conversion
- Original-measurement, print, and copy-link modes
- Browser-local saved recipes
- Shopping-list transfer and controls
- Seven-day browser-local meal plan
- Guided cooking with progress, keyboard controls, timers, completion feedback, and supported wake lock
- Cross-tab state updates and private-route cache controls

### Offline and install foundation

- Web application manifest and branded icon
- Secure-context service-worker registration
- Network-first navigation and offline fallback
- Cache-first same-origin static assets
- API and media routes excluded from service-worker interception

### Guarded authentication foundation

The account system is implemented for D1 but disabled by default.

- Case-insensitive D1 email and username identities
- Pending, active, locked, suspended, and deleted states
- PBKDF2-HMAC-SHA256 with 600,000 iterations, unique salt, and server-only pepper
- Verified-active-only Workers KV sessions
- Production `__Host-` HTTP-only session cookie
- D1 `auth_version` session revocation
- Signed, purpose-bound, time-limited CSRF tokens
- KV-backed login and registration rate limits
- Server-side Turnstile Siteverify with action and hostname validation
- Five-attempt, 15-minute account lockout
- Single-use email-verification token digests
- Consent history, OAuth extension tables, and privacy-preserving audit events
- Independent sign-in and registration activation flags
- Non-secret readiness diagnostics in `/api/health`

Pending or unverified accounts cannot create sessions. Public registration remains closed until legal, email-delivery, Turnstile, D1, KV, secret, and operational requirements are approved.

### Guarded R2 media and moderation

Contributor media is implemented but independently disabled.

- One-time D1 upload intents with token digests and expiry
- Server-generated R2 keys
- JPEG, PNG, and WebP allowlist; SVG rejected
- 8 MB limit, dimension limits, 40-megapixel cap, raster signature parsing, MIME/size verification, and raw SHA-256 checksum
- Private R2 originals with D1 ownership and lifecycle metadata
- Contributor-private pending previews
- Editor/admin moderation queue at `/admin/media`
- Pending, approved, rejected, and quarantined states
- Required reasons for reject and quarantine decisions
- Trigger-backed moderation history
- Anonymous delivery only for uploaded and approved assets
- Private no-store previews and immutable public delivery with ETags

Privacy-safe transformed derivatives are not implemented yet and are the recommended next phase.

### Initial recipe submission

- Browser-autosaved recipe editor at `/recipes/new`
- Country, language, measurement, taxonomy, timing, yield, ingredient, and direction fields
- Dynamic rows, live preview, Worker validation, field errors, and JSON export
- Private hero-image upload and attachment
- Protected `/api/recipes/submissions`
- Same-origin, signed CSRF, session CSRF, body-size, rate-limit, and canonical validation checks
- D1 category, media ownership, purpose, moderation-state, and one-recipe assignment checks
- Atomic D1 batch for recipe, categories, ingredients, and directions
- Successful submissions enter private `review` status
- Public D1 reads expose only `published` recipes

### Editorial review and publication

- Editor/admin queue at `/admin/recipes`
- Detailed private review at `/admin/recipes/:id`
- Publish, request-changes, and archive actions
- Publication requires complete relational content and an uploaded, approved hero image
- Final conditional publication update rechecks media approval
- Optimistic revision checks prevent stale decisions
- Archive and requested-change reasons are server-enforced
- Trigger-backed `recipe_editorial_events`

### Requested changes and contributor revisions

The completed correction workflow is:

```text
review
  → editor requests changes
  → draft (owner-only correction state)
  → contributor resubmits
  → review
  → publish or another decision
```

- Editor request reason must contain at least 10 characters
- `draft` is not public or collaborative; it is an owner-only requested-change state
- Contributor status cards at `/account/submissions`
- Owner-only revision editor at `/account/submissions/:id/edit`
- Recipe-specific browser autosave
- Existing eligible media restoration and replacement-upload support
- Protected `/api/recipes/:id/resubmit`
- Purpose-bound `recipe-resubmit` CSRF, session CSRF, ownership, status, expected-revision, rate-limit, and canonical validation
- Separate optimistic `revision` and content `content_revision`
- Temporary unique `revision_write_token` guards every relational delete and insert
- Stale contributor requests cannot partially replace relational content
- Atomic recipe, media, category, ingredient, direction, and snapshot replacement
- Immutable baseline and revised JSON snapshots in `recipe_revision_snapshots`

## Cloudflare architecture

| Concern | Implementation |
| --- | --- |
| Frontend and SSR | Astro 7 on Cloudflare Workers |
| Static assets | Workers Static Assets |
| Current public data | Versioned TypeScript fallback catalogue |
| Relational recipe/account data | Cloudflare D1 |
| Sessions and lightweight security state | Workers KV |
| Original contributor media | Cloudflare R2 |
| Future derivatives | Cloudflare Images or Worker-based transforms |
| Bot protection | Turnstile |
| Verification delivery | Authenticated HTTPS webhook |
| Market detection | Cloudflare request `cf.country` |
| CI/CD | GitHub Actions and Wrangler Action v4 |

## Authoritative D1 migrations

Wrangler applies only this nested sequence:

```text
migrations/d1/0001_initial/migration.sql
migrations/d1/0002_seed/migration.sql
migrations/d1/0003_market_coverage/migration.sql
migrations/d1/0004_auth_accounts/migration.sql
migrations/d1/0005_media_pipeline/migration.sql
migrations/d1/0006_recipe_editorial/migration.sql
migrations/d1/0007_recipe_revisions/migration.sql
```

`wrangler.d1.jsonc` uses:

```jsonc
"migrations_pattern": "migrations/d1/*/migration.sql"
```

Migration four adds account, identity, consent, token, and audit security. Migration five adds media intents, lifecycle, moderation, and event history. Migration six adds recipe-media ownership, lock revisions, editorial timestamps/events, and status-transition triggers. Migration seven adds content revisions, change-request/resubmission timestamps, guarded write tokens, and immutable snapshots.

Root-level SQL files are legacy references and are not part of Wrangler's execution path.

## Local commands

Requirements: Node.js 22 or newer. CI uses Node.js 24.

```bash
npm ci
npm run validate
npm run dev
```

D1 schema/build testing:

```bash
npm run db:migrate:local
npm run build:d1
```

D1-free production build/deployment commands:

```bash
npm run build
npm run deploy
```

Keep trusted-write flags false unless a deliberate non-production or production activation procedure is being executed.

## Guarded GitHub workflows

- `.github/workflows/ci.yml` validates catalogue, seven migrations, security invariants, public scripts, operational scripts, Cloudflare types, and the Worker build.
- `.github/workflows/deploy.yml` deploys the D1-free Worker from `main`.
- `.github/workflows/enable-d1.yml` requires exact `ENABLE_D1` confirmation before provisioning/migrating D1 while trusted writes remain disabled.
- `.github/workflows/enable-auth.yml` requires exact `ENABLE_AUTH`, applies migrations, enables sign-in, and independently controls registration, media, and recipe submissions/revisions.
- Recipe submissions require media uploads.
- Deployment health verification includes contributor revisions, requested changes, immutable snapshots, and optimistic-locking capabilities.
- Runner-only secret/config files are deleted even after failure.

## Important routes

### Public and browser-local

- `/`
- `/search`
- `/markets` and `/markets/:country`
- `/categories` and `/categories/:slug`
- `/recipes/:slug`
- `/recipes/:slug/cook`
- `/saved`
- `/shopping-list`
- `/meal-plan`
- `/offline`
- `/api/recipes`
- `/api/recipes/validate`
- `/api/health`

### Account and contributor

- `/login`, `/register`, `/verify-email`, `/account`
- `/recipes/new`
- `/account/submissions`
- `/account/submissions/:id/edit`
- `/api/auth/*`
- `/api/media/intents`
- `/api/media/upload`
- `/api/media/mine`
- `/api/recipes/submissions`
- `/api/recipes/:id/resubmit`

### Editorial and media operations

- `/admin/media`
- `/admin/recipes`
- `/admin/recipes/:id`
- `/api/media/:id/moderate`
- `/api/recipes/:id/editorial`
- `/media/:key`

Private account, contributor, admin, media-write, submission, resubmission, and editorial routes receive no-store/noindex protections where appropriate.

## Documentation

- [`docs/PROJECT_HANDOFF.md`](docs/PROJECT_HANDOFF.md) — authoritative completed scope, safety boundaries, next phase, and new-chat prompt
- [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) — completed and remaining engineering scope
- [`docs/CLOUDFLARE_SETUP.md`](docs/CLOUDFLARE_SETUP.md) — Cloudflare/GitHub deployment boundaries
- [`docs/D1_AUTH_SETUP.md`](docs/D1_AUTH_SETUP.md) — authentication, media, recipe activation, health, and rollback
- [`docs/MEDIA_PIPELINE.md`](docs/MEDIA_PIPELINE.md) — upload validation, moderation, delivery, and derivative boundary
- [`docs/RECIPE_EDITORIAL.md`](docs/RECIPE_EDITORIAL.md) — submission, requested changes, resubmission, snapshots, publication, tests, and rollback

## Validation baseline

The last verified implementation head before documentation synchronization was:

```text
7ea198c57407f44dc130eb6c6936b8fb255ae91a
```

GitHub Actions CI run `#290` passed dependency installation, project validation, operational script validation, Cloudflare type generation, and the Astro Worker build. Documentation commits may move the current branch head, so always verify PR `#1` before continuing.

## Remaining production phases

1. Provision a non-production D1/R2 environment and execute account, media, submission, revision, and rollback test matrices.
2. Approve Terms and Privacy text and verification-email operations.
3. Provision controlled administrator/editor credentials.
4. Add privacy-safe image derivatives, EXIF/metadata stripping, orientation normalization, responsive WebP/AVIF variants, regeneration, and cleanup.
5. Add contributor edits to published recipes, editorial editing, scheduled publishing, archive restoration, snapshot restore, and richer conflict resolution.
6. Add account-synchronized saves, shopping lists, meal plans, ratings, reviews, comments, and collections.
7. Add password reset, email change, account deletion, and administration interfaces.
8. Add nutrition/taxonomy/localization administration, queued jobs, search indexing, recommendations, analytics, and advertising controls.
