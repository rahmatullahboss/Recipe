# Ozzyl Recipes Project Handoff

This is the authoritative continuation summary for `rahmatullahboss/Recipe`, branch `feat/cloudflare-recipe-foundation`, pull request `#1`.

Always fetch current PR metadata and each current blob SHA before writing. Documentation and concurrent work may move the branch.

## Repository state

- Repository: `rahmatullahboss/Recipe`
- Branch: `feat/cloudflare-recipe-foundation`
- Pull request: `#1`
- PR remains open and unmerged.
- Private published-recipe change-set implementation reached head `e71f4b37a0af63f0e4804a7d3d911223b9a994c4` and passed CI run `#336`.
- Documentation commits followed; fetch the exact current head and verify its CI before further work.

## Production boundary

The public application remains D1-free. Checked-in D1 configuration keeps every trusted-write surface closed:

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false",
"MEDIA_UPLOADS_ENABLED": "false",
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

No deployment, D1 activation, account provisioning, real upload, real recipe creation/submission/change-set operation/scheduling/publication, moderation decision, archive restoration, merge, or production change was performed.

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
- Guarded regeneration, cross-table media reservation, and rejection/quarantine/deletion cleanup

### Initial contributor/editorial recipes

- Atomic first submission into private `review`
- Public D1 reads restricted to `published`
- Editor/admin queue and detailed review
- Request changes and owner-only `review → draft → review` correction
- Separate optimistic `revision` and `content_revision`
- Temporary unique `revision_write_token` guards relational replacement
- Immutable `recipe_revision_snapshots`
- Final publication rechecks complete content, approved media, source checksum, derivative policy, and required derivative matrix

### Scheduled publication and archive restoration

Migration `0009_recipe_publication_workflow` adds future UTC schedule/replace/cancel, `schedule_revision`, due/archived indexes, archive/restore timestamps, and `recipe_publication_events`.

- Scheduled recipes remain private in `review`.
- Active schedule requires `schedule_revision = revision`.
- Immediate and due publication repeat complete content/media/checksum/derivative gates in the final D1 update.
- `POST /api/recipes/scheduled/process` is editor/admin, same-origin, purpose/session-CSRF protected, bounded, deterministic, and idempotent.
- Archive clears schedule state.
- Restore is only `archived → review` and never republishes directly.
- Automatic Cron/queue execution is not configured.

## Private published-recipe change sets completed

Migration `0010_published_recipe_change_sets` adds:

- `recipe_change_sets`;
- `recipe_change_set_events`;
- exact `base_recipe_revision` and `base_content_revision`;
- private `base_content_json` and proposed `content_json`;
- one-active-change-set-per-recipe uniqueness;
- active media reservation uniqueness;
- contributor/editor queue indexes;
- published-owner triggers;
- cross-table recipe/change-set media reservation triggers.

### Live-row isolation

A contributor update to an already published recipe is never written into the live recipe while drafting or reviewing.

```text
published live recipe remains unchanged
  └─ private change set: draft
       → review
       → changes_requested → review
       → approved and atomically promoted
       → or cancelled
```

Create/save/submit/request-changes/cancel modify only private change-set state and audit history.

### Contributor surfaces

- `/account/submissions`
- `/account/submissions/:id/change-set`
- `POST /api/recipes/:id/change-set`

Contributor actions are `create`, `save`, `submit`, and `cancel`. They require verified ownership, same-origin request, purpose/session CSRF, rate/body limits, canonical validation, matching optimistic change-set revision, exact live base revisions, valid categories, and eligible non-conflicting media.

### Editorial surfaces

- `/admin/recipe-change-sets`
- `/admin/recipe-change-sets/:id`
- `POST /api/recipe-change-sets/:id/editorial`

Editorial actions are `request_changes`, `approve`, and `cancel`. The private detail compares baseline/proposed scalar fields, categories, ingredients, directions, media, notes, revisions, and audit events.

### Atomic promotion

Approval revalidates:

- change-set review status/revision;
- live recipe still `published`;
- exact base recipe/content revisions;
- canonical proposed JSON and categories;
- proposed media ownership, uploaded/approved state, current checksum, `recipe-images-v1` derivative policy, and complete mandatory variants;
- no conflicting media assignment/reservation.

One D1 batch acquires a unique `revision_write_token`, updates live scalar/media fields while preserving `published`, increments recipe/content revisions, clears stale scheduling, guardedly replaces categories/ingredients/directions, approves the change set, records the resulting recipe revision/audit event, and clears the token.

A stale first update causes every relational statement to no-op. Any failed statement rolls back the complete batch. Public content cannot be partially replaced.

### Media reservation

Active proposed media cannot be assigned to another recipe/change set or deleted. Cross-table D1 triggers protect existing submission/revision paths, and the media delete endpoint checks both live recipe assignments and active change-set reservations.

## Health and activation hardening

`/api/health` reports non-secret capabilities for:

- scheduled publishing and guarded manual processing;
- archive restoration;
- schedule revision/media/atomic promotion gates;
- automatic schedule cron disabled;
- live published-row isolation;
- one active published change set;
- private baseline/proposed snapshots;
- change-set optimistic and base guards;
- media reservation;
- approval-time media/derivative revalidation;
- atomic normalized promotion;
- immutable change-set audit events.

The guarded authentication workflow fails closed if recipe writes are requested while any required capability is absent.

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
```

Wrangler applies only this nested sequence. Root SQL files remain legacy references.

## Validation evidence

Implementation head `e71f4b37a0af63f0e4804a7d3d911223b9a994c4` passed GitHub Actions CI run `#336`:

- checkout and Node.js 24 setup;
- locked dependency installation;
- project/security/change-set validation;
- operational script validation;
- all ten local D1 migrations;
- D1-free Worker build;
- D1 Worker build.

After documentation updates, verify CI again on the exact current PR head before continuing.

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
- `docs/PUBLISHED_RECIPE_CHANGE_SETS.md`

## Remaining boundaries and recommended next work

1. Execute controlled non-production acceptance for media derivatives, submissions, corrections, scheduling, archive/restore, private published change sets, media reservations, concurrency, and rollback.
2. Add editor-authored private change sets using the same live-row isolation and atomic promotion guarantees.
3. Restore a historical recipe snapshot into a new private change set.
4. Add richer three-way conflict comparison or merge assistance without weakening optimistic rejection.
5. Add optional Cron/queue scheduling only after manual processor and incident procedures are accepted.
6. Add malware/semantic scanning and approved retention/legal policies.
7. Add account lifecycle and synchronized kitchen/community features.

Do not directly mutate a live published recipe for future editor or snapshot-restoration features.

## Continuation rules

1. Use connected GitHub data, not memory alone.
2. Fetch PR `#1` and verify the current head before writing.
3. Fetch the current blob SHA immediately before every existing-file update.
4. Do not make no-op updates or update one path concurrently.
5. Keep all four checked-in flags false.
6. Do not deploy, activate D1, provision accounts, upload media, create/revise/schedule/publish real recipes, moderate, restore real content, merge, or change production unless explicitly requested.
7. Preserve ownership, approved derivative delivery, private no-store previews, published-only public reads, checksums/ETags, generation leases, media reservations, schedule revisions, optimistic base guards, and atomic D1 safety.
8. Run and verify CI on the final head.

## Ready-to-paste continuation prompt

```text
Continue the Ozzyl Recipes GitHub project from the connected repository.

Repository: rahmatullahboss/Recipe
Branch: feat/cloudflare-recipe-foundation
Pull request: #1

Fetch the current PR head and current file blob SHAs before writing. Read README.md and every document referenced by docs/PROJECT_HANDOFF.md.

The project includes Astro 7/Cloudflare international discovery, D1-free fallback data, cooking/planning/offline tools, guarded authentication, private R2 originals, privacy-safe responsive derivatives, approval-gated derivative-only delivery, atomic initial recipe submission, requested corrections, immutable snapshots, immediate/future publication, guarded manual due processing, archive restoration, and private contributor change sets for already published recipes through migration 0010.

Private published change sets keep the live published row unchanged during drafting/review, reserve proposed media, capture exact base recipe/content revisions, and use approval-time media/derivative revalidation plus revision_write_token-guarded atomic normalized promotion.

Continue with controlled runtime acceptance, editor-authored private change sets, or restoring historical snapshots into new private change sets. Keep all checked-in flags false; do not deploy, activate, provision, upload, moderate, create/revise/schedule/publish real content, merge, or change production. Verify CI on the final head.
```
