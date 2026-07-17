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
| Initial recipe submission and correction | Complete in code | Disabled |
| Immediate/scheduled publication and archive restoration | Complete in code | Disabled; no automatic cron configured |
| Contributor private change sets for published recipes | Complete in code | Disabled |
| Editor-authored private change sets | Complete in code | Disabled |
| Historical snapshot restoration into private proposals | Complete in code | Disabled |
| Rich three-way conflict assistance | Not implemented | Not available |
| Community/account synchronization | Not implemented | Not available |

The public product remains D1-free. Trusted writes were not activated.

## Completed platform scope

### Public discovery and kitchen tools

- Astro 7 SSR on Cloudflare Workers
- Ten initial international markets and D1-free fallback catalogue
- Market-aware search/API, taxonomy pages, structured data, sitemap, robots, and real 404s
- Serving scaling, measurement conversion, print, copy link, saves, shopping list, meal plan, and guided cooking
- Manifest, service worker, offline fallback, and private/API/media cache exclusions

### Authentication, media, and derivatives

- Case-insensitive D1 identities, lifecycle/lock states, PBKDF2-HMAC-SHA256, verified-active KV sessions, production `__Host-` cookie, and `auth_version` revocation
- Purpose-bound CSRF, same-origin checks, rate limits, Turnstile, token digests, consent, OAuth extension, and privacy-preserving audit events
- One-time upload intents and server-generated private R2 originals
- JPEG/PNG/WebP validation, SVG rejection, 8 MiB/dimension/40 MP/signature/MIME/size/checksum/ETag gates
- EXIF orientation parsing, `recipe-images-v1` derivatives, generated metadata scanners, deterministic keys, generation leases, and cleanup
- Original bytes never publicly served; private derivative previews are no-store
- Approval/current-derivative public delivery gate
- Active recipe/change-set media reservations

### Submission, publication, and restoration

- Browser-autosaved new-recipe editor and atomic initial submission into private `review`
- Published-only public D1 reads
- Editor/admin review, publish, request changes, scheduling, archive, and restore-to-review
- Owner-only correction workflow with separate `revision` and `content_revision`
- `revision_write_token` guarded normalized relational replacement
- Immutable `recipe_revision_snapshots`
- Immediate and due scheduled publication with repeated content/media/derivative checks
- Deterministic guarded manual due processor and no automatic Cron Trigger
- `archived → review` restoration only

### Contributor private published-recipe change sets

Migration `0010_published_recipe_change_sets` provides:

- one active private change set per recipe;
- exact base recipe/content revisions;
- private baseline/proposed JSON;
- contributor create/save/submit/withdraw/requested-change loop;
- proposed media reservation;
- baseline-versus-proposal editorial review;
- approval-time category, owner media, checksum, derivative-policy, and required-variant revalidation;
- shared atomic scalar and normalized relational promotion;
- immutable change-set events;
- unchanged live published rows before approval.

See [`PUBLISHED_RECIPE_CHANGE_SETS.md`](PUBLISHED_RECIPE_CHANGE_SETS.md).

### Editor-authored proposals and historical restoration

Migration `0011_editor_change_set_origins` adds immutable origin metadata for:

```text
editor_current
revision_snapshot
approved_change_set_proposed
approved_change_set_baseline
```

Implemented behavior:

- Editor/admin may launch a private proposal for any contributor-owned published recipe.
- Current normalized live content is always captured as the new baseline.
- Proposal content may start from current live content, a `recipe_revision_snapshots` row, or baseline/proposed JSON from an approved published change set.
- Historical JSON is revalidated through the current canonical draft validator and category table.
- Editors may select only eligible media already owned by the recipe contributor; uploading on behalf of an owner is unavailable.
- Ineligible historical media falls back to current eligible owner media when possible and records `media_fallback_applied`; otherwise a no-media private draft may be saved but not submitted.
- Editor-controlled `draft` rows are read-only for contributors in both UI and API.
- Editor save/submit/cancel requires role, same-origin, purpose/session CSRF, rate/body limits, optimistic change-set revision, exact live base, valid content/categories, and eligible owner media before submission.
- Submitted proposals use the existing independent review detail and shared atomic approval path.
- Requested changes hand correction control to the recipe owner.
- Create/save/submit/cancel/restore operations never mutate the live published recipe.

See [`EDITOR_RECIPE_CHANGE_SETS.md`](EDITOR_RECIPE_CHANGE_SETS.md).

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
migrations/d1/0011_editor_change_set_origins/migration.sql
```

Wrangler applies only the nested sequence through `migrations_pattern`. Root SQL files remain legacy references.

## Checked-in boundary

```text
AUTH_ENABLED=false
AUTH_REGISTRATION_ENABLED=false
MEDIA_UPLOADS_ENABLED=false
RECIPE_SUBMISSIONS_ENABLED=false
```

No D1 activation, account provisioning, upload, real moderation, recipe creation, private change-set operation, historical restoration, scheduling, publication, deployment, merge, or production change occurred.

## Validation baseline

Implementation head:

```text
c651f235dc40387e852ae0de1e865df746731fb7
```

GitHub Actions CI run `#356` passed:

- checkout and Node.js 24 setup;
- locked dependency installation;
- catalogue/security/editor-change-set validator;
- operational script validation;
- all eleven migrations on fresh local D1 state;
- D1-free Worker build;
- D1 Worker build.

Documentation commits may move the current branch head. Always fetch PR `#1` before continuing.

## Important routes

- `/account/submissions/:id/change-set` — owner proposal editor/status and read-only editor-draft view
- `POST /api/recipes/:id/change-set` — contributor create/save/submit/cancel, with editor-draft lock
- `/admin/recipe-change-sets` — review queue and published-recipe proposal launcher
- `/admin/recipe-change-sets/:id` — baseline/proposal comparison, audit, request changes, approval, or closure
- `/admin/recipes/:id/change-set` — editor current-live/historical private workspace
- `POST /api/recipes/:id/editor-change-set` — editor create/restore/save/submit/cancel
- `POST /api/recipe-change-sets/:id/editorial` — shared request-changes/approve/cancel path
- `POST /api/recipes/:id/editorial` — initial submission publication workflow
- `POST /api/recipes/scheduled/process` — guarded manual due processor

## Remaining work

1. Execute controlled non-production acceptance for all account/media/derivative/submission/revision/schedule/archive/contributor-editor-change-set/historical-restore/concurrency/rollback cases.
2. Add richer three-way conflict comparison or merge assistance without weakening optimistic rejection.
3. Add optional Cloudflare Cron/queue execution only after manual processor acceptance and incident procedures.
4. Approve legal, retention, moderation, verification-email, deletion, and incident operations.
5. Add synchronized saves, shopping lists, meal plans, ratings, reviews, comments, and collections.
6. Add password reset, email change, account deletion, and administration interfaces.
7. Add taxonomy/localization/nutrition administration, search indexing, recommendations, analytics, and advertising controls.
