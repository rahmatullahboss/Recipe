# Ozzyl Recipes Project Handoff

This is the authoritative continuation summary for `rahmatullahboss/Recipe`, branch `feat/cloudflare-recipe-foundation`, pull request `#1`.

Always fetch current PR metadata and each current blob SHA before writing. Documentation and concurrent work may move the branch.

## Repository state

- Repository: `rahmatullahboss/Recipe`
- Branch: `feat/cloudflare-recipe-foundation`
- Pull request: `#1`
- PR remains open and unmerged.
- Three-way conflict implementation head `b2a249a903b66164f36f9ccde0894c77b088e457` passed CI run `#374`.
- Navigation/documentation commits followed; verify CI again on the exact current head before further work.

## Production boundary

The public application remains D1-free. Checked-in D1 configuration keeps every trusted-write surface closed:

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false",
"MEDIA_UPLOADS_ENABLED": "false",
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

No deployment, D1 activation, account provisioning, real upload, real recipe/change-set/historical-restore/private-rebase operation, scheduling/publication, moderation decision, archive restoration, merge, or production change was performed.

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

## Editor-authored proposals and historical restoration

Migration `0011_editor_change_set_origins` adds immutable origin records with source types:

```text
editor_current
revision_snapshot
approved_change_set_proposed
approved_change_set_baseline
```

Origin metadata records source audit pointers, historical content revision, safe media fallback, editor/admin creator, and timestamp. D1 triggers require editor/admin creator identity, require origin creator to match `recipe_change_sets.created_by`, and reject origin updates.

Editors can create a private proposal from current normalized live content, a `recipe_revision_snapshots` row, proposed JSON from an approved change set, or the baseline captured before an approved change set.

Current live content always becomes the new private baseline. Historical content becomes only proposed JSON and is revalidated through the canonical validator and category table. No restore action directly changes public content.

Editors cannot upload on behalf of a contributor. They may select only eligible contributor-owned `recipe_hero` media with current derivatives and no assignment/reservation conflict. Ineligible historical media falls back to current eligible owner media and records `media_fallback_applied=1`; without eligible media, private save is allowed but review submission is blocked.

An origin-backed `draft` is editor-controlled. Contributor UI/API are read-only until editor submission and reviewer request changes. Requested changes hand control to the recipe owner.

## Audited three-way conflict assistance completed

### Migration `0012_recipe_change_set_rebases`

Adds immutable `recipe_change_set_rebases` records containing:

- fixed strategy `recipe-three-way-v1`;
- actor and change-set/recipe identity;
- previous/resulting change-set revisions;
- previous/resulting base recipe/content revisions;
- proposal-only/live-only/same-change/conflict counts;
- explicit conflict choices;
- previous baseline, current live, previous proposal, and resulting proposal JSON;
- creation timestamp.

D1 rejects audit updates. A trigger requires each inserted audit to match the resulting private `recipe_change_sets` state.

### Three-way model

The service reconstructs and validates:

```text
stored baseline
actual current normalized live recipe
private proposed recipe
```

Units are title, summary, description, media, market, language, measurement system, prep/cook time, servings, difficulty, categories, ingredients, and directions.

Each unit is classified as:

```text
unchanged
proposal_only
live_only
same_change
conflict
```

Safe defaults:

- proposal-only → proposed value;
- live-only → current live value;
- same-change/unchanged → current live value;
- conflict → explicit `live` or `proposed` choice required.

Categories are compared as a set. Categories, ingredients, and directions remain atomic units; unsafe item-level merge inference is not attempted.

### Controller and review boundary

- Owner controls a contributor-created `draft`.
- Editor/admin controls an origin-backed editor `draft`.
- Owner controls every `changes_requested` proposal.
- `review` is read-only and cannot be rebased.
- Reviewer may perform a private request-changes handoff even when the base is stale.
- Existing approval service remains exact-base guarded and cannot approve stale content.

### Guarded private rebase

Route:

```text
POST /api/recipe-change-sets/:id/rebase
```

Requires verified session, same origin, purpose/session CSRF, rate/body limits, matching change-set revision, current controller, live status `published`, a stale base, canonical content/categories, eligible owner media, current checksum/derivative policy/required variants, and no assignment/reservation conflict.

One D1 batch conditionally:

1. moves private base revisions to current live revisions;
2. stores current live JSON as the new private baseline;
3. stores resolved private proposal JSON/media;
4. increments only the private change-set revision;
5. inserts immutable before/live/after rebase audit.

The batch never updates live scalar fields, categories, ingredients, directions, media references, status, or publication timestamps. Any failure rolls back the entire private operation.

### Surfaces

- `/account/change-sets/:id/conflicts` — owner/editor baseline/live/proposal report and controller-only rebase controls
- `/account/submissions/:id/change-set` — contributor stale-state lock and conflict link
- `/admin/recipe-change-sets` — review/active proposal conflict links
- `/admin/recipe-change-sets/:id` — real baseline/live/proposal review, stale approval block, conflict handoff
- `POST /api/recipe-change-sets/:id/rebase` — guarded audited private rebase

All private pages/APIs are no-store/noindex where applicable.

## Health, CI, and activation boundary

`/api/health` reports non-secret capabilities for:

- scheduling/manual processor/archive restoration and automatic Cron disabled;
- published live-row isolation, one-active guard, private JSON, optimistic/base guards;
- media reservation, approval media/derivative revalidation, atomic normalized promotion, immutable events;
- editor-authored proposals, historical restoration, immutable origins, contributor lock, current-live baseline, media fallback, and shared approval;
- three-way comparison;
- atomic collection units;
- explicit conflict choices;
- private-only rebase;
- immutable rebase audit;
- stale approval blocked;
- reviewer conflict handoff.

CI validates all conflict fields and code/schema invariants. The protected `.github/workflows/enable-auth.yml` remains unchanged beyond editor/historical checks because the connector rejected a full replacement containing protected deployment/secret context. `docs/CLOUDFLARE_SETUP.md` also remained unchanged for the same connector safety reason. Review these two operational surfaces before real activation.

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

Implementation head `b2a249a903b66164f36f9ccde0894c77b088e457` passed GitHub Actions CI run `#374`:

- checkout and Node.js 24 setup;
- locked dependency installation;
- project/security/conflict validation;
- operational browser-script validation;
- all twelve migrations on fresh local D1 state;
- D1-free Worker build;
- D1 Worker build.

After documentation/navigation updates, verify CI again on the exact current PR head before continuing.

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
- `docs/RECIPE_CHANGE_SET_CONFLICTS.md`

## Remaining boundaries and recommended next work

1. Execute controlled non-production acceptance for media derivatives, submissions/corrections, scheduling, archive/restore, contributor/editor proposals, historical restoration, media fallback/reservations, private rebases, concurrency, and rollback.
2. Review and extend protected activation checks for conflict-assistance health fields.
3. Add optional Cron/queue scheduling only after manual processor and incident procedures are accepted.
4. Add malware/semantic scanning and approved retention/legal/moderation policies.
5. Add account lifecycle and synchronized kitchen/community features.
6. Add taxonomy/localization/nutrition administration, indexing, recommendations, analytics, and advertising controls.

Do not directly mutate a live published recipe for conflict resolution or restoration.

## Continuation rules

1. Use connected GitHub data, not memory alone.
2. Fetch PR `#1` and verify the current head before writing.
3. Fetch the current blob SHA immediately before every existing-file update.
4. Do not make no-op updates or update one path concurrently.
5. Keep all four checked-in flags false.
6. Do not deploy, activate D1, provision accounts, upload media, create/restore/revise/rebase/schedule/publish real recipes, moderate, merge, or change production unless explicitly requested.
7. Preserve ownership, approved derivative delivery, private no-store previews, published-only reads, checksums/ETags, generation leases, media reservations, schedule revisions, optimistic base guards, immutable origins/rebases, explicit conflict choices, controller boundaries, and atomic D1 safety.
8. Run and verify CI on the final head.

## Ready-to-paste continuation prompt

```text
Continue the Ozzyl Recipes GitHub project from the connected repository.

Repository: rahmatullahboss/Recipe
Branch: feat/cloudflare-recipe-foundation
Pull request: #1

Fetch the current PR head and current file blob SHAs before writing. Read README.md and every document referenced by docs/PROJECT_HANDOFF.md.

The project includes Astro 7/Cloudflare international discovery, D1-free fallback data, cooking/planning/offline tools, guarded authentication, private R2 originals, privacy-safe derivatives, initial submission/correction/publication/scheduling/archive restoration, contributor/editor private published-recipe proposals, historical restoration, and audited three-way private rebases through migration 0012.

Three-way assistance compares stored baseline/current live/private proposal, requires explicit choices for real conflicts, treats categories/ingredients/directions atomically, updates only private state, stores immutable before/live/after audit, and never weakens exact-base approval.

Continue with controlled non-production acceptance, protected activation-check review, or another documented remaining phase. Keep all checked-in flags false; do not deploy, activate, provision, upload, moderate, create/restore/revise/rebase/schedule/publish real content, merge, or change production. Verify CI on the final head.
```
