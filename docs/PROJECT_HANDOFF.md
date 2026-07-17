# Ozzyl Recipes Project Handoff

This is the authoritative continuation summary for `rahmatullahboss/Recipe`, branch `feat/cloudflare-recipe-foundation`, pull request `#1`.

Always fetch current PR metadata and each current blob SHA before writing. Documentation and concurrent work may move the branch.

## Repository state

- Repository: `rahmatullahboss/Recipe`
- Branch: `feat/cloudflare-recipe-foundation`
- Pull request: `#1`
- PR remains open and unmerged.
- Scheduled-publication implementation code reached head `15fa2ce2f2ac6aa2c823585075ed19d368b94d1f` and passed CI run `#310`.
- Documentation and activation-hardening commits followed; recheck the current final head and its CI before continuing.

## Production boundary

The public application remains D1-free. Checked-in D1 configuration keeps every trusted-write surface closed:

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false",
"MEDIA_UPLOADS_ENABLED": "false",
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

No deployment, D1 activation, account provisioning, real upload, real recipe creation/submission/scheduling/publication, moderation decision, archive restoration, merge, or production change was performed.

## Completed platform foundation

### Public product

- Astro 7 SSR on Cloudflare Workers
- D1-free fallback catalogue for ten initial markets
- Market-aware discovery, search/API, taxonomy pages, structured data, sitemap, robots, and real 404s
- Serving scaling, measurement conversion, print/copy, saved recipes, shopping list, meal plan, and guided cooking
- PWA manifest, service worker, offline fallback, and private/API/media cache exclusions

### Guarded authentication

- Case-insensitive D1 identities and lifecycle states
- PBKDF2-HMAC-SHA256 with 600,000 iterations, unique salt, and server-only pepper
- Verified-active-only KV sessions and production host cookie
- D1 session revocation version
- Purpose-bound signed CSRF, same-origin checks, rate limits, Turnstile, lockout, verification token digests, consent, OAuth extension, and privacy-preserving audit events
- Independent authentication and registration flags

### Private media and privacy-safe derivatives

- One-time D1 upload intents and server-generated private R2 keys
- JPEG/PNG/WebP validation, 8 MiB limit, dimension/40 MP/signature/MIME/size/checksum checks
- EXIF orientation parsing and normalized dimensions
- `recipe-images-v1` 320/640/960/1280 variants without upscaling
- Required JPEG/WebP and optional exact-MIME AVIF through 960 px
- Generated-byte metadata scanners
- Deterministic policy/checksum keys and D1 generation leases
- Source/output checksum and R2 ETag validation
- Original bytes never served by `/media`
- Owner/editor derivative-only `private, no-store` previews
- Public delivery only for uploaded/approved parents with complete current derivatives
- Guarded regeneration and rejection/quarantine/deletion cleanup

### Contributor and editorial recipes

- Atomic first submission into private `review`
- Public D1 reads restricted to `published`
- Editor/admin queue and detailed review
- Request changes and owner-only `review → draft → review` correction
- Separate optimistic `revision` and `content_revision`
- Temporary unique `revision_write_token` guards relational replacement
- Immutable `recipe_revision_snapshots`
- Final publication rechecks complete content, approved media, source checksum, derivative policy, and required derivative matrix

## Scheduled publication and archive restoration completed

### Migration `0009_recipe_publication_workflow`

Adds:

- `recipes.scheduled_publish_at`
- `recipes.scheduled_by`
- `recipes.schedule_revision`
- `recipes.archived_at`
- `recipes.restored_at`
- due-schedule and archived-operation indexes
- `recipe_publication_events`

Publication event actions are:

```text
schedule
cancel_schedule
published_now
scheduled_published
archive
restore
```

### Schedule model

A scheduled recipe remains private in `review`. An active schedule requires:

```text
scheduled_publish_at is not null
schedule_revision = revision
```

Scheduling or replacing a schedule increments recipe revision and stores the resulting value in `schedule_revision`. Any later recipe transition invalidates the old schedule through revision mismatch.

Schedule times are UTC, at least five minutes in the future, and no more than one year ahead.

### Immediate and due publication gates

Both paths repeat these checks in the final conditional D1 update:

- status is still `review`;
- optimistic recipe revision matches;
- schedule revision/time match for due processing;
- at least two ingredients;
- at least two directions;
- at least one category;
- media is uploaded and approved;
- derivative job matches current source checksum and `recipe-images-v1`;
- all required JPEG/WebP variants are ready.

Concurrent content, media, checksum, derivative, schedule, or status changes return conflict instead of publishing stale content.

### Guarded manual processor

Route:

```text
POST /api/recipes/scheduled/process
```

Requires:

- verified session;
- editor/admin role;
- same-origin request;
- purpose-bound `recipe-schedule-process` CSRF;
- current session CSRF;
- limit between 1 and 25;
- complete recipe pipeline readiness.

Due rows use deterministic time/ID ordering. Each recipe uses its own atomic D1 batch. Successful promotion clears schedule state and increments revision; re-running is idempotent.

Automatic Cloudflare Cron or queue execution is intentionally not configured. Health reports `automaticScheduleCronConfigured=false`.

### Archive restoration

Archiving a review recipe clears schedule state and records `archived_at` plus publication audit history.

Restoration is only:

```text
archived → review
```

It requires editor/admin reason and expected revision, clears schedule/write-token state, records `restored_at`, and never republishes directly.

### Admin surfaces

- `/admin/recipes` — review queue, active schedules, archived operations, manual due processor
- `/admin/recipes/:id` — publish now, schedule/replace, cancel schedule, request changes, archive, restore to review, and publication history
- `/api/recipes/:id/editorial` — guarded workflow actions
- `/api/recipes/scheduled/process` — guarded manual due processor

All remain private/no-store/noindex where applicable.

## Health and activation hardening

`/api/health` reports:

- scheduled publishing
- guarded schedule processor
- archive restoration
- schedule revision guard
- scheduled media revalidation
- atomic scheduled promotion
- automatic schedule cron disabled

The guarded authentication workflow checks these capabilities when recipe writes are requested. It fails closed if any capability is missing or automatic cron is unexpectedly enabled.

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
```

Wrangler applies only this nested sequence. Root SQL files remain legacy references.

## Validation evidence

Implementation head `15fa2ce2f2ac6aa2c823585075ed19d368b94d1f` passed GitHub Actions CI run `#310`:

- checkout and Node.js 24 setup;
- locked dependency installation;
- project/security/publication validation;
- operational script validation;
- all nine local D1 migrations;
- D1-free Worker build;
- D1 Worker build.

After documentation/hardening updates, verify CI again on the exact current PR head before continuing.

## Documentation

- `README.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/CLOUDFLARE_SETUP.md`
- `docs/D1_AUTH_SETUP.md`
- `docs/MEDIA_PIPELINE.md`
- `docs/MEDIA_DERIVATIVE_TEST_MATRIX.md`
- `docs/MEDIA_DERIVATIVE_ROLLBACK.md`
- `docs/RECIPE_EDITORIAL.md`
- `docs/RECIPE_PUBLICATION_WORKFLOW.md`

## Remaining boundaries and next recommended phase

1. Execute controlled non-production acceptance for media derivatives, submissions, revisions, scheduling, archive/restore, concurrency, and rollback.
2. Add private change sets for contributor revisions of already published recipes. The live `published` row must remain unchanged until atomic editorial promotion.
3. Add editor-authored content editing and snapshot restore.
4. Add optional Cron/queue scheduling only after the manual processor and incident procedures are accepted.
5. Add malware/semantic scanning and approved retention/legal policies.
6. Add account lifecycle and synchronized kitchen/community features.

Published-recipe revisions are not yet implemented. Do not reuse the owner-only requested-change `draft` state to mutate a live published row.

## Continuation rules

1. Use connected GitHub data, not memory alone.
2. Fetch PR `#1` and verify the current head before writing.
3. Fetch the current blob SHA immediately before every existing-file update.
4. Do not make no-op updates or update one path concurrently.
5. Keep all four checked-in flags false.
6. Do not deploy, activate D1, provision accounts, upload media, create/schedule/publish recipes, moderate, restore real content, merge, or change production unless explicitly requested.
7. Preserve ownership, approved derivative delivery, private no-store previews, published-only public reads, checksums/ETags, generation leases, schedule revisions, optimistic locking, and atomic D1 safety.
8. Run and verify CI on the final head.

## Ready-to-paste continuation prompt

```text
Continue the Ozzyl Recipes GitHub project from the connected repository.

Repository: rahmatullahboss/Recipe
Branch: feat/cloudflare-recipe-foundation
Pull request: #1

Fetch the current PR head and current file blob SHAs before writing. Read README.md and every document referenced by docs/PROJECT_HANDOFF.md.

The project now includes Astro 7/Cloudflare international discovery, D1-free fallback data, cooking/planning/offline tools, guarded authentication, private R2 originals, privacy-safe responsive derivatives, approval-gated derivative-only delivery, atomic recipe submission, requested changes, owner-only race-safe resubmission, immutable snapshots, immediate publication, future UTC scheduling, guarded manual due processing, audit history, and archive restoration through migration 0009.

Continue with controlled runtime acceptance and private change sets for contributor revisions of already published recipes. Preserve the live published row until atomic promotion. Keep all checked-in flags false; do not deploy, activate, provision, upload, moderate, schedule/publish real content, merge, or change production. Verify CI on the final head.
```
