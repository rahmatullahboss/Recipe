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
| Contributor private change sets for published recipes | Complete in code | Disabled |
| Editor-authored change sets and snapshot restore | Not implemented | Not available |
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
- Active recipe/change-set media reservations
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

- future UTC schedule/replace/cancel;
- schedule ownership and `schedule_revision` guard;
- due/archived indexes;
- `recipe_publication_events`;
- immediate and due publication through the same final content/media checks;
- deterministic manual editor/admin due processing;
- conflict-safe per-recipe atomic batches;
- `archived → review` restoration only;
- no automatic Cron Trigger.

See [`RECIPE_PUBLICATION_WORKFLOW.md`](RECIPE_PUBLICATION_WORKFLOW.md).

### Private published-recipe change sets

Migration `0010_published_recipe_change_sets` adds:

- `recipe_change_sets`;
- `recipe_change_set_events`;
- one active private change set per recipe;
- exact base recipe/content revisions;
- private baseline and proposed full recipe JSON;
- proposed media reservation;
- contributor/editor queue indexes;
- published-owner and cross-table media reservation triggers.

Implemented behavior:

- Only the owning contributor can create a private update for a `published` recipe.
- Create/save/submit/request-changes/cancel do not mutate the live recipe.
- Contributor saves and submissions revalidate canonical content, category existence, exact live base, media ownership, derivative readiness, and reservation state.
- Editor/admin review compares private baseline and proposed content.
- Approval revalidates live base, approved media, current checksum, derivative policy, and mandatory variants.
- A temporary unique `revision_write_token` guards live scalar and normalized relational replacement.
- Successful approval keeps status `published`, increments `revision` and `content_revision`, clears old scheduling state, and records resulting revisions.
- Failed or stale approval leaves the live recipe and normalized relations unchanged.
- Private pages/APIs are no-store/noindex where applicable.
- Activation health checks fail closed if isolation, base guards, media reservation, derivative revalidation, atomic promotion, or audit capabilities are missing.

See [`PUBLISHED_RECIPE_CHANGE_SETS.md`](PUBLISHED_RECIPE_CHANGE_SETS.md).

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
migrations/d1/0010_published_recipe_change_sets/migration.sql
```

Wrangler applies only the nested sequence through `migrations_pattern`. Root SQL files remain legacy references.

## Checked-in boundary

```text
AUTH_ENABLED=false
AUTH_REGISTRATION_ENABLED=false
MEDIA_UPLOADS_ENABLED=false
RECIPE_SUBMISSIONS_ENABLED=false
```

No D1 activation, account provisioning, upload, real moderation, recipe creation, private change-set operation, scheduling, publication, restoration, deployment, merge, or production change occurred.

## Validation baseline

Implementation head:

```text
e71f4b37a0af63f0e4804a7d3d911223b9a994c4
```

GitHub Actions CI run `#336` passed:

- checkout and Node.js 24 setup;
- locked dependency installation;
- catalogue/security/change-set validator;
- operational script validation;
- all ten local D1 migrations;
- D1-free Worker build;
- D1 Worker build.

Documentation commits may move the current branch head. Always fetch PR `#1` before continuing.

## Important new routes

- `/account/submissions/:id/change-set` — owner-only private published update editor/status
- `POST /api/recipes/:id/change-set` — create, save, submit, or cancel owner change set
- `/admin/recipe-change-sets` — editor/admin private update queue
- `/admin/recipe-change-sets/:id` — baseline/proposal comparison and audit history
- `POST /api/recipe-change-sets/:id/editorial` — request changes, approve/promote, or cancel
- `POST /api/recipes/:id/editorial` — publish, schedule, cancel schedule, request changes, archive, or restore initial submissions
- `POST /api/recipes/scheduled/process` — guarded editor/admin due processor

## Remaining work

1. Execute controlled non-production acceptance for all account/media/derivative/submission/revision/schedule/archive/change-set/concurrency/rollback cases.
2. Add editor-authored private change sets using the same live-row isolation and atomic promotion model.
3. Restore a historical recipe snapshot into a new private change set rather than mutating live content.
4. Add richer three-way conflict comparison or merge assistance without weakening optimistic rejection.
5. Add optional Cloudflare Cron/queue execution only after manual processor acceptance and incident procedures.
6. Approve legal, retention, moderation, verification-email, and deletion operations.
7. Add synchronized saves, shopping lists, meal plans, ratings, reviews, comments, and collections.
8. Add password reset, email change, account deletion, and administration interfaces.
9. Add taxonomy/localization/nutrition administration, search indexing, recommendations, analytics, and advertising controls.
