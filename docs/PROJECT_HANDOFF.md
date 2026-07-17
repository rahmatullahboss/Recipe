# Ozzyl Recipes Project Handoff

This is the authoritative continuation summary for `rahmatullahboss/Recipe`, branch `feat/cloudflare-recipe-foundation`, pull request `#1`.

Always fetch current PR metadata and each current blob SHA before writing. Documentation and concurrent work may move the branch.

## Repository state

- Repository: `rahmatullahboss/Recipe`
- Branch: `feat/cloudflare-recipe-foundation`
- Pull request: `#1`
- PR remains open and unmerged.
- Editor-authored proposal and historical-restore implementation reached head `c651f235dc40387e852ae0de1e865df746731fb7` and passed CI run `#356`.
- Documentation commits followed; fetch the exact current head and verify its CI before further work.

## Production boundary

The public application remains D1-free. Checked-in D1 configuration keeps every trusted-write surface closed:

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false",
"MEDIA_UPLOADS_ENABLED": "false",
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

No deployment, D1 activation, account provisioning, real upload, real recipe/change-set/historical-restore operation, scheduling/publication, moderation decision, archive restoration, merge, or production change was performed.

## Completed platform foundation

### Public product

- Astro 7 SSR on Cloudflare Workers
- D1-free fallback catalogue for ten initial markets
- Market-aware discovery/search/API/taxonomy, structured data, sitemap, robots, and real 404s
- Serving scaling, measurement conversion, print/copy, saved recipes, shopping list, meal plan, and guided cooking
- PWA manifest, service worker, offline fallback, and private/API/media cache exclusions

### Guarded authentication

- Case-insensitive D1 identities and lifecycle states
- PBKDF2-HMAC-SHA256 with 600,000 iterations, unique salt, and server-only pepper
- Verified-active-only KV sessions, production host cookie, and D1 session revocation version
- Purpose-bound signed CSRF, same-origin checks, rate limits, Turnstile, lockout, verification token digests, consent, OAuth extension, and privacy-preserving audit events
- Independent authentication, registration, media, and recipe-write flags

### Private media and derivatives

- One-time upload intents and server-generated private R2 keys
- JPEG/PNG/WebP validation, SVG rejection, 8 MiB/dimension/40 MP/signature/MIME/size/checksum gates
- EXIF orientation parsing and normalized dimensions
- `recipe-images-v1` 320/640/960/1280 variants without upscaling
- Required JPEG/WebP and optional exact-MIME AVIF through 960 px
- Generated metadata scanners, deterministic policy/checksum keys, generation leases, output checksum/ETag validation
- Original bytes never served by `/media`
- Owner/editor derivative-only `private, no-store` previews
- Public delivery only for uploaded/approved parents with complete current derivatives
- Guarded regeneration, cross-table media reservation, and rejection/quarantine/deletion cleanup

### Initial submission, correction, publication, and restoration

- Atomic first submission into private `review`
- Public D1 reads restricted to `published`
- Editor/admin review, request changes, publish, schedule, archive, and restore-to-review
- Owner-only `review → draft → review` correction
- Separate optimistic `revision` and `content_revision`
- Temporary unique `revision_write_token` guards normalized replacement
- Immutable `recipe_revision_snapshots`
- Immediate and due publication repeat complete content/approved-media/checksum/derivative gates
- Guarded manual due processor is bounded, deterministic, idempotent, and editor/admin-only
- Restore is only `archived → review`; automatic Cron/queue execution is not configured

## Contributor private published-recipe change sets

Migration `0010_published_recipe_change_sets` adds:

- `recipe_change_sets` and `recipe_change_set_events`;
- exact `base_recipe_revision` and `base_content_revision`;
- private `base_content_json` and proposed `content_json`;
- one-active-change-set-per-recipe uniqueness;
- active media reservation uniqueness and cross-table triggers;
- published-owner and contributor/editor queue protections.

A contributor update to an already published recipe is never written into live content while drafting or reviewing.

```text
published live recipe remains unchanged
  └─ private change set: draft
       → review
       → changes_requested → review
       → approved and atomically promoted
       → or cancelled
```

Contributor actions are create/save/submit/cancel. Editorial actions are request changes/approve/cancel. All require verified identity/role, same-origin, purpose/session CSRF, limits, optimistic revisions, exact live base, canonical content/categories, and eligible owner media.

Approval revalidates live `published` status, exact base revisions, canonical proposed JSON/categories, owner media approval/checksum/current `recipe-images-v1` derivatives, and reservation state. One D1 batch uses a unique `revision_write_token` to update scalar/media fields, increment live recipe/content revisions, clear stale scheduling, replace categories/ingredients/directions, approve/audit the change set, and clear the token. Any failure rolls back the complete operation.

## Editor-authored proposals and historical restoration completed

### Migration `0011_editor_change_set_origins`

Adds immutable `recipe_change_set_origins` records with source types:

```text
editor_current
revision_snapshot
approved_change_set_proposed
approved_change_set_baseline
```

Origin metadata records source audit pointers, historical content revision, whether safe media fallback occurred, editor/admin creator, and timestamp. D1 triggers require editor/admin creator identity, require origin creator to match `recipe_change_sets.created_by`, and reject origin updates.

Source snapshot/change-set IDs are immutable audit pointers rather than cascading foreign keys, avoiding cyclic deletion dependencies with historical change sets.

### Current and historical sources

Editors can create a private proposal from:

- the current normalized live recipe;
- a `recipe_revision_snapshots` row;
- proposed JSON from an approved change set;
- baseline JSON captured before an approved change set.

The current live recipe always becomes the new private baseline. Historical content becomes only proposed JSON. Historical JSON is passed through the current canonical validator and category table. No restore action directly changes public content.

### Media and ownership

Editors cannot upload on behalf of a contributor. They may select only eligible `recipe_hero` media owned by the recipe owner, with current ready derivatives and no assignment/reservation conflict.

If historical media is no longer eligible, the service attempts to use current eligible owner media and records `media_fallback_applied=1`. If no eligible media exists, a private draft may be created/saved with null media, but submission to review is blocked.

### Control boundary

An origin-backed status `draft` is editor-controlled.

- Contributor UI is read-only.
- Contributor API save/submit/cancel returns `403`.
- Editor service refuses contributor-controlled drafts.
- Editor save/submit/cancel requires editor/admin role, exact live/change-set revisions, canonical content/categories, same-origin, purpose/session CSRF, and limits.
- After editor submission, the existing independent review queue and shared approval service are used.
- If a reviewer requests changes, status becomes `changes_requested` and contributor control opens through the existing owner editor.

### Surfaces

- `/admin/recipe-change-sets` — review queue and published recipe proposal launcher
- `/admin/recipes/:id/change-set` — current-live/historical private editor workspace
- `POST /api/recipes/:id/editor-change-set` — create/restore/save/submit/cancel
- `/admin/recipe-change-sets/:id` — existing comparison, audit, request-changes, and approval
- `/account/submissions/:id/change-set` — owner workflow plus read-only editor-draft view

All private pages/APIs are no-store/noindex where applicable.

## Health and activation hardening

`/api/health` reports non-secret capabilities for:

- scheduling/manual processor/archive restoration and automatic Cron disabled;
- published live-row isolation, one-active guard, private JSON, optimistic/base guards;
- media reservation, approval media/derivative revalidation, atomic normalized promotion, immutable events;
- editor-authored published proposals;
- historical snapshot restore;
- immutable editor origin audit;
- contributor lock on editor-controlled drafts;
- current-live baseline capture;
- historical-media fallback;
- shared atomic approval.

The guarded authentication workflow fails closed if recipe writes are requested while any capability is absent.

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
```

Wrangler applies only this nested sequence. Root SQL files remain legacy references.

## Validation evidence

Implementation head `c651f235dc40387e852ae0de1e865df746731fb7` passed GitHub Actions CI run `#356`:

- checkout and Node.js 24 setup;
- locked dependency installation;
- project/security/editor-change-set validation;
- operational script validation;
- all eleven migrations on fresh local D1 state;
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
- `docs/EDITOR_RECIPE_CHANGE_SETS.md`

## Remaining boundaries and recommended next work

1. Execute controlled non-production acceptance for media derivatives, submissions/corrections, scheduling, archive/restore, contributor/editor private proposals, historical restoration, media fallback/reservations, concurrency, and rollback.
2. Add richer three-way conflict comparison or merge assistance without weakening optimistic conflict rejection.
3. Add optional Cron/queue scheduling only after manual processor and incident procedures are accepted.
4. Add malware/semantic scanning and approved retention/legal/moderation policies.
5. Add account lifecycle and synchronized kitchen/community features.
6. Add taxonomy/localization/nutrition administration, indexing, recommendations, analytics, and advertising controls.

Do not directly mutate a live published recipe for future conflict-resolution or restoration features.

## Continuation rules

1. Use connected GitHub data, not memory alone.
2. Fetch PR `#1` and verify the current head before writing.
3. Fetch the current blob SHA immediately before every existing-file update.
4. Do not make no-op updates or update one path concurrently.
5. Keep all four checked-in flags false.
6. Do not deploy, activate D1, provision accounts, upload media, create/restore/revise/schedule/publish real recipes, moderate, merge, or change production unless explicitly requested.
7. Preserve ownership, approved derivative delivery, private no-store previews, published-only reads, checksums/ETags, generation leases, media reservations, schedule revisions, optimistic base guards, immutable origins, contributor/editor control boundaries, and atomic D1 safety.
8. Run and verify CI on the final head.

## Ready-to-paste continuation prompt

```text
Continue the Ozzyl Recipes GitHub project from the connected repository.

Repository: rahmatullahboss/Recipe
Branch: feat/cloudflare-recipe-foundation
Pull request: #1

Fetch the current PR head and current file blob SHAs before writing. Read README.md and every document referenced by docs/PROJECT_HANDOFF.md.

The project includes Astro 7/Cloudflare international discovery, D1-free fallback data, cooking/planning/offline tools, guarded authentication, private R2 originals, privacy-safe derivatives, initial submission/correction/publication/scheduling/archive restoration, contributor private published-recipe change sets, editor-authored private proposals, and historical snapshot restoration through migration 0011.

All published-recipe proposals keep live content unchanged until shared approval-time owner/media/checksum/derivative/base revalidation and revision_write_token-guarded atomic normalized promotion. Editor-controlled drafts are contributor read-only; historical content becomes only proposed JSON with recorded safe media fallback.

Continue with controlled runtime acceptance or richer three-way conflict comparison/merge assistance. Keep all checked-in flags false; do not deploy, activate, provision, upload, moderate, create/restore/revise/schedule/publish real content, merge, or change production. Verify CI on the final head.
```
