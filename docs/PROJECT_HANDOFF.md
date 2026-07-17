# Ozzyl Recipes Project Handoff

This document is the authoritative continuation summary for the current feature branch. It records what is implemented, what remains disabled, the operational boundaries, and the recommended next engineering phase.

## Repository state

- Repository: `rahmatullahboss/Recipe`
- Branch: `feat/cloudflare-recipe-foundation`
- Pull request: `#1`
- PR title: `Build international Astro 7 recipe platform with guarded accounts, media, publishing, and revisions`
- Last verified implementation head before documentation synchronization: `7ea198c57407f44dc130eb6c6936b8fb255ae91a`
- Last verified CI for that implementation head: run `#290`, successful
- PR state at verification: open, mergeable, not merged, not draft

Always re-read the current PR head and the current blob SHA before editing a file. Documentation commits may move the branch beyond the implementation head listed above.

## Production and safety boundary

The checked-in public deployment remains D1-free. No production database, account, upload, submission, editorial, or revision feature has been activated.

The D1 configuration keeps every trusted write surface closed:

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false",
"MEDIA_UPLOADS_ENABLED": "false",
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

Do not enable flags, provision accounts, upload real contributor media, create real submissions, make moderation decisions, publish recipes, deploy the D1 configuration, merge the PR, or modify production unless the user explicitly requests that action.

## Completed platform foundation

### International discovery

- Astro 7 SSR on Cloudflare Workers
- D1-free fallback catalogue
- Initial market coverage for the United States, Canada, the United Kingdom, Australia, New Zealand, France, Germany, Switzerland, Sweden, and the Netherlands
- Cloudflare country detection and persistent manual market selection
- Market, category, and cuisine landing pages
- Search and API filtering by keyword, ingredient, market, taxonomy, difficulty, total time, and sorting
- Schema.org Recipe data, sitemap, robots, and real 404 responses

### Cooking, planning, and offline tools

- Serving scaling and approximate US/metric conversion
- Print, copy-link, original-measurement, save, shopping-list, and meal-plan tools
- Seven-day browser-local meal plan
- Guided cooking mode with progress, keyboard controls, timers, completion feedback, and supported wake lock
- Cross-tab browser state
- Manifest, service worker, offline fallback, and static resource caching

### Authentication foundation

- Case-insensitive D1 identities
- Pending, active, locked, suspended, and deleted account states
- PBKDF2-HMAC-SHA256 with 600,000 iterations, unique salt, and a server-only pepper
- Verified-active-only Workers KV sessions
- Production `__Host-` HTTP-only session cookie
- `auth_version` session revocation
- Signed purpose-bound CSRF tokens
- Login and registration rate limits
- Server-side Turnstile Siteverify with action and hostname validation
- Five-attempt, 15-minute account lockout
- Single-use email verification token digests
- Consent history, OAuth extension tables, and privacy-preserving authentication audit events
- Independent sign-in and registration activation flags

### Moderated R2 media foundation

- One-time D1 upload intents with token digests and expiry
- Server-generated R2 object keys
- JPEG, PNG, and WebP allowlist; SVG rejected
- 8 MB limit, dimension limits, 40-megapixel cap, raster signature parsing, expected MIME/size checks, and raw SHA-256 checksum
- Private R2 originals with D1 ownership and lifecycle metadata
- Contributor-private pending previews
- Editor/admin media queue
- Pending, approved, rejected, and quarantined moderation states
- Reason requirements for reject and quarantine
- Trigger-backed moderation history
- Anonymous delivery only for uploaded and approved assets
- Private no-store previews and immutable public delivery with ETags

## Completed recipe submission and editorial workflow

### Initial submission

- Browser-autosaved new-recipe editor at `/recipes/new`
- Worker validation and JSON export
- Protected first-submission API at `/api/recipes/submissions`
- Same-origin, purpose-bound CSRF, session CSRF, body-size, rate-limit, and canonical validation checks
- D1 category validation
- Contributor media ownership, purpose, upload state, moderation state, and one-recipe assignment validation
- Atomic D1 batch for recipe, categories, ingredients, and directions
- Private `review` status after submission
- Public D1 queries restricted to `published`

### Editorial review

- Editor/admin queue at `/admin/recipes`
- Detailed private review at `/admin/recipes/:id`
- Publish, request-changes, and archive actions
- Approved uploaded hero image required for publication
- Minimum relational content checks for publication
- Final conditional publication write rechecks media approval
- Archive reason requirement
- Trigger-backed editorial events

### Requested changes and contributor revisions

- Editor request reason of at least 10 characters
- `review → draft` transition for requested changes
- In this workflow, `draft` means an owner-only correction state, not a public/shared draft
- Contributor status cards at `/account/submissions`
- Owner-only revision editor at `/account/submissions/:id/edit`
- Recipe-specific browser autosave for unsent corrections
- Existing eligible media restoration and replacement-upload support
- Protected resubmission API at `/api/recipes/:id/resubmit`
- Purpose-bound `recipe-resubmit` CSRF, session CSRF, ownership, status, expected-revision, rate-limit, and canonical validation checks
- Separate optimistic `revision` and content `content_revision` counters
- Temporary unique `revision_write_token` that guards every relational delete/insert statement
- Stale contributor requests cannot partially delete or replace relational content
- Atomic recipe, media, category, ingredient, direction, and snapshot replacement
- Immutable baseline and revised JSON snapshots in `recipe_revision_snapshots`
- Successful resubmission returns `draft → review`

## Authoritative D1 migrations

Wrangler applies only the nested migration chain:

```text
migrations/d1/0001_initial/migration.sql
migrations/d1/0002_seed/migration.sql
migrations/d1/0003_market_coverage/migration.sql
migrations/d1/0004_auth_accounts/migration.sql
migrations/d1/0005_media_pipeline/migration.sql
migrations/d1/0006_recipe_editorial/migration.sql
migrations/d1/0007_recipe_revisions/migration.sql
```

Migration responsibilities:

1. Core recipe, taxonomy, localisation, nutrition, interaction, and media tables
2. Initial catalogue seed
3. Market coverage
4. Authentication, consent, identity, token, and audit schema
5. Media upload intents, lifecycle, moderation, and moderation events
6. Recipe-media ownership, optimistic lock revision, editorial timestamps, events, and transition triggers
7. Content revisions, change-request/resubmission timestamps, guarded write token, and immutable recipe revision snapshots

Root-level SQL files are legacy references and are not in Wrangler's authoritative migration path.

## Private and protected routes

- `/login`, `/register`, `/verify-email`, `/account`
- `/recipes/new`
- `/account/submissions`
- `/account/submissions/:id/edit`
- `/admin/media`
- `/admin/recipes`
- `/admin/recipes/:id`
- `/api/auth/*`
- `/api/media/*`
- `/api/recipes/submissions`
- `/api/recipes/:id/resubmit`
- `/api/recipes/:id/editorial`

Middleware applies private/no-store behavior to account, admin, media-write, submission, revision, and editorial surfaces. Robots rules prevent indexing of private account/admin/API/editor routes.

## Health and guarded activation

`/api/health` exposes non-secret readiness for bindings, authentication, registration, media, and recipe submissions. Recipe capability diagnostics include:

- approved media required for publication
- optimistic locking
- requested changes
- contributor revisions
- immutable snapshots

The guarded **Enable Authentication** workflow:

- requires exact `ENABLE_AUTH`
- keeps optional write surfaces independently controlled
- rejects recipe submissions unless media uploads are enabled
- applies pending migrations before final activation
- uses runner-only temporary configuration and secret files
- verifies deployed health
- verifies revision capability booleans when recipe submissions are requested
- removes temporary files even after failure

## Validation state

The project validator covers:

- fallback catalogue and market coverage
- exact seven-stage D1 migration order
- authentication security invariants
- media validation and approval-gated delivery
- recipe submission/editorial/revision invariants
- contributor ownership and resubmit CSRF/rate limiting
- guarded write token and immutable snapshots
- checked-in fail-closed flags
- browser JavaScript and service-worker syntax

Last verified implementation CI run `#290` passed dependency installation, project validation, operational script validation, Cloudflare type generation, and the Astro Worker build.

## Documentation map

- `README.md` — product overview, architecture, configuration, migrations, routes, and remaining phases
- `docs/CLOUDFLARE_SETUP.md` — Cloudflare and GitHub deployment boundaries
- `docs/D1_AUTH_SETUP.md` — authentication/media/recipe activation order and rollback
- `docs/MEDIA_PIPELINE.md` — upload validation, moderation, delivery, and derivative boundary
- `docs/RECIPE_EDITORIAL.md` — initial submission, requested changes, revision transactions, snapshots, publication, tests, and rollback
- `docs/IMPLEMENTATION_STATUS.md` — completed and remaining engineering scope
- `docs/PROJECT_HANDOFF.md` — authoritative continuation context and new-chat prompt

## Known boundary and remaining work

The completed revision workflow does not yet support:

- contributor edits to an already published recipe
- editorial editing on behalf of contributors
- scheduled publishing
- archive restoration
- restoring a prior snapshot into an active draft
- collaborative editing
- merge/conflict resolution beyond optimistic rejection

Recommended next engineering phase:

### Privacy-safe image derivatives

1. Define derivative metadata/schema and lifecycle.
2. Normalize EXIF orientation.
3. Strip EXIF and unnecessary metadata.
4. Produce bounded responsive variants, preferably WebP and AVIF where supported.
5. Keep originals private.
6. Serve only approved derivatives publicly.
7. Preserve ownership, moderation, and ETag/cache guarantees.
8. Add cleanup and regeneration behavior.
9. Add health diagnostics, validator invariants, test matrix, and rollback docs.
10. Keep all activation flags false and do not deploy.

After image derivatives, continue with published-recipe revisioning, scheduled publication, archive restoration, account lifecycle interfaces, synchronized kitchen data, community features, and operational administration.

## Continuation rules for another ChatGPT session

1. Use the connected GitHub repository, not memory alone.
2. Fetch PR `#1` and verify the current branch head before writing.
3. Fetch the current blob SHA immediately before every `update_file`.
4. Do not run no-op file updates; GitHub can still create commits.
5. Never write two sequential changes to the same path in parallel.
6. Keep all checked-in trusted-write flags false.
7. Do not merge or deploy unless explicitly instructed.
8. Preserve public `published`-only reads and private/no-store boundaries.
9. Run/verify CI after implementation and document the exact successful run.
10. Update this handoff and the relevant architecture/status docs after each phase.

## Ready-to-paste new-chat prompt

```text
Continue the Ozzyl Recipes GitHub project from the connected repository.

Repository: rahmatullahboss/Recipe
Branch: feat/cloudflare-recipe-foundation
Pull request: #1

First, fetch the current PR metadata and branch head. Do not rely only on the SHA in this prompt because documentation commits or concurrent work may have moved the branch. Then read these files before changing code:

- docs/PROJECT_HANDOFF.md
- docs/IMPLEMENTATION_STATUS.md
- docs/RECIPE_EDITORIAL.md
- docs/MEDIA_PIPELINE.md
- docs/D1_AUTH_SETUP.md
- README.md

The platform already includes the international Astro 7/Cloudflare foundation, D1-free fallback catalogue, search and cooking tools, guarded authentication, moderated private R2 media, atomic recipe submission, editor/admin publication, requested changes, owner-only contributor corrections, race-safe resubmission, separate lock/content revisions, and immutable recipe revision snapshots through migration 0007.

Continue with the next recommended phase: privacy-safe image derivatives. Implement metadata stripping, orientation normalization, responsive WebP/AVIF derivatives, private originals, approved-derivative-only public delivery, regeneration/cleanup behavior, health diagnostics, validator invariants, tests, and documentation.

Important constraints:
- Recheck current file blob SHAs before every write.
- Keep AUTH_ENABLED, AUTH_REGISTRATION_ENABLED, MEDIA_UPLOADS_ENABLED, and RECIPE_SUBMISSIONS_ENABLED false in checked-in config.
- Do not deploy, activate D1, provision accounts, upload real media, publish real recipes, merge the PR, or change production.
- Preserve ownership checks, moderation gating, private no-store previews, published-only recipe reads, optimistic revision safety, and atomic D1 behavior.
- Run and verify CI on the final head.
- Update README.md, docs/IMPLEMENTATION_STATUS.md, docs/MEDIA_PIPELINE.md, docs/RECIPE_EDITORIAL.md when relevant, docs/D1_AUTH_SETUP.md when activation changes, and docs/PROJECT_HANDOFF.md.
- Give me a concise Bangla status summary after completing the phase.
```
