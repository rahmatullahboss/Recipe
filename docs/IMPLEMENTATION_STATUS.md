# Implementation Status

Read [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md) for authoritative continuation context.

## Executive status

| Area | Code status | Production status |
| --- | --- | --- |
| International discovery and fallback catalogue | Complete for current milestone | Available in D1-free mode |
| Search, cooking, planning, and offline tools | Complete for current milestone | Available in D1-free mode |
| D1 authentication foundation | Complete in code | Disabled |
| Moderated private R2 media | Complete in code | Disabled |
| Privacy-safe image derivatives | Complete for `recipe-images-v1` | Disabled; runtime acceptance pending |
| Initial recipe submission | Complete in code | Disabled |
| Requested changes and owner resubmission | Complete in code | Disabled |
| Immutable recipe revision snapshots | Complete in code | Disabled |
| Immediate editorial publication | Complete in code | Disabled |
| Scheduled publication and cancellation | Complete in code | Disabled |
| Guarded manual due processor | Complete in code | Disabled; no automatic cron configured |
| Archive restoration to private review | Complete in code | Disabled |
| Contributor revisions of published recipes | Not implemented | Not available |
| Community/account synchronization | Not implemented | Not available |

The public product remains D1-free. Trusted writes were not activated.

## Completed platform scope

### Public discovery and kitchen tools

- Astro 7 SSR on Cloudflare Workers
- Ten initial international markets
- D1-free fallback catalogue
- Market-aware search/API and taxonomy pages
- Structured data, sitemap, robots, and real 404 responses
- Serving scaling, measurement conversion, print, copy link, saved recipes, shopping list, meal plan, and guided cooking
- Manifest, service worker, offline fallback, and private/API/media cache exclusions

### Authentication foundation

- Case-insensitive D1 identities
- Account lifecycle and lock states
- PBKDF2-HMAC-SHA256 with 600,000 iterations
- Verified-active-only KV sessions
- Production `__Host-` cookie
- `auth_version` session revocation
- Purpose-bound CSRF and same-origin checks
- KV rate limits, Turnstile, lockout, token digests, consent, OAuth extension, and privacy-preserving audit events
- Independent sign-in and registration flags

### Media and privacy-safe derivatives

- One-time D1 upload intents
- Server-generated private R2 originals
- JPEG/PNG/WebP validation and SVG rejection
- 8 MiB, dimension, 40 MP, signature, MIME/size, source checksum, and R2 ETag checks
- EXIF orientation parsing and normalized dimensions
- `recipe-images-v1` 320/640/960/1280 bounded variants
- Required JPEG/WebP and optional exact-MIME AVIF
- Generated metadata scanners
- Deterministic keys and D1 generation leases
- Output checksum/ETag storage
- Original bytes never publicly served
- Owner/editor private no-store derivative previews
- Approval and complete-current-derivative public gate
- Rejection/quarantine/deletion cleanup
- Guarded regeneration and delete routes

### Contributor and editorial recipes

- Browser-autosaved new-recipe editor
- Atomic initial submission into private `review`
- Published-only public D1 reads
- Editor/admin review queue
- Publish, request changes, and archive
- Owner-only correction state and editor
- Separate optimistic `revision` and `content_revision`
- `revision_write_token` guarded relational replacement
- Immutable recipe snapshots
- Approved-media and complete-derivative publication gate

### Scheduled publication and restoration

Migration `0009_recipe_publication_workflow` adds:

- `scheduled_publish_at`
- `scheduled_by`
- `schedule_revision`
- `archived_at`
- `restored_at`
- due/archived indexes
- `recipe_publication_events`

Implemented behavior:

- Schedule or replace a future UTC publication time
- Cancel an active schedule
- Increment revision on every schedule mutation
- Require `schedule_revision = revision` for due eligibility
- Recheck content, approved media, source checksum, policy version, and required derivative count at final promotion
- Clear schedule state on publish or archive
- Guarded editor/admin manual processor with deterministic ordering and per-recipe atomic batches
- Idempotent retries and conflict-safe concurrent processing
- Restore `archived → review` only
- Separate publication workflow history
- Non-secret health diagnostics
- Automatic cron explicitly reported as not configured

## Authoritative migrations

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

Wrangler applies only the nested sequence through `migrations_pattern`. Root SQL files remain legacy references.

## Checked-in boundary

```text
AUTH_ENABLED=false
AUTH_REGISTRATION_ENABLED=false
MEDIA_UPLOADS_ENABLED=false
RECIPE_SUBMISSIONS_ENABLED=false
```

No D1 activation, account provisioning, upload, real moderation, recipe creation, scheduling, publication, restoration, deployment, merge, or production change occurred.

## Validation baseline

Implementation head:

```text
15fa2ce2f2ac6aa2c823585075ed19d368b94d1f
```

GitHub Actions CI run `#310` passed:

- checkout and Node.js 24 setup;
- locked dependency installation;
- catalogue/security/publication validator;
- operational script validation;
- all nine local D1 migrations;
- D1-free Worker build;
- D1 Worker build.

Documentation commits may move the current branch head. Always fetch PR `#1` before continuing.

## Important new routes

- `POST /api/recipes/:id/editorial` — publish, schedule, cancel schedule, request changes, archive, or restore
- `POST /api/recipes/scheduled/process` — guarded editor/admin due processor
- `/admin/recipes` — review queue, schedule/archive operations, manual processor
- `/admin/recipes/:id` — schedule, cancellation, restoration, and publication history

## Remaining work

1. Execute controlled non-production acceptance for all account/media/derivative/submission/revision/schedule/archive/rollback cases.
2. Add private change sets for contributor revisions of already published recipes while preserving the live published row until atomic approval.
3. Add editor-authored content editing and snapshot restore.
4. Add optional Cloudflare Cron/queue execution only after manual processor acceptance and incident procedures.
5. Approve legal, retention, moderation, verification-email, and deletion operations.
6. Add synchronized saves, shopping lists, meal plans, ratings, reviews, comments, and collections.
7. Add password reset, email change, account deletion, and administration interfaces.
8. Add taxonomy/localization/nutrition administration, search indexing, recommendations, analytics, and advertising controls.
