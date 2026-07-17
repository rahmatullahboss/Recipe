# Implementation Status

Read [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md) for the authoritative continuation context and ready-to-paste new-chat prompt.

## Executive status

| Area | Code status | Production status |
| --- | --- | --- |
| International discovery and fallback catalogue | Complete for current milestone | Available in D1-free mode |
| Search, cooking, planning, and offline tools | Complete for current milestone | Available in D1-free mode |
| D1 authentication foundation | Complete in code | Disabled; dependencies and activation pending |
| Moderated private R2 media | Complete in code except derivatives | Disabled; operational testing pending |
| Initial recipe submission | Complete in code | Disabled |
| Editorial review and publication | Complete in code | Disabled |
| Requested changes and owner resubmission | Complete in code | Disabled |
| Immutable recipe revision snapshots | Complete in code | Disabled |
| Privacy-safe image derivatives | Not implemented | Not available |
| Published-recipe revisioning and scheduled publishing | Not implemented | Not available |
| Community/account synchronization and administration | Not implemented | Not available |

The core public product and guarded account/media/submission/editorial/revision foundations are implemented. Production operationalization is intentionally not performed. The next recommended engineering phase is privacy-safe image derivatives.

## Completed

### Platform and markets

- Astro 7 SSR on Cloudflare Workers
- International positioning with no country-specific brand bias
- Supported initial markets: US, Canada, UK, Australia, New Zealand, France, Germany, Switzerland, Sweden, and the Netherlands
- Cloudflare country detection with persistent manual override
- At least one fallback recipe for every supported market
- D1-free static catalogue for immediate public deployment
- Optional D1 repository with public fallback behavior

### Discovery

- Market-aware homepage, search, JSON API, and recipe cards
- Keyword, ingredient, category, cuisine, market, difficulty, time, and sort filters
- Country, category, and cuisine landing pages
- Shared filtering across static fallback and D1 repositories
- Recipe structured data, sitemap, robots, and real 404 responses

### Cooking and private planning

- Serving adjustment and approximate US/metric conversion
- Original-measurement, print, and copy-link modes
- Browser-local saved recipes
- Recipe-to-shopping-list transfer and list controls
- Browser-local seven-day meal planner
- Recipe-to-next-open-day planning
- Guided cooking, keyboard navigation, timers, completion feedback, and supported wake lock
- Cross-tab updates and private-route caching controls

### Offline and install foundation

- Web application manifest and branded icon
- Secure-context service-worker registration
- Network-first navigation and offline fallback
- Cache-first same-origin static resources
- API and media routes excluded from interception

### D1 authentication foundation

- Case-insensitive D1 email and username identities
- Pending, active, locked, suspended, and deleted account states
- PBKDF2-HMAC-SHA256 with 600,000 iterations, unique salt, and server-only pepper
- Verified-active-only Workers KV sessions
- HTTP-only production cookie with `__Host-` prefix
- D1 `auth_version` session revocation
- Signed purpose-bound CSRF tokens
- KV-backed login and registration rate limits
- Server-side Turnstile Siteverify with action and hostname checks
- Five-attempt, 15-minute account lockout
- Single-use email verification token digests
- Authenticated email-delivery webhook with failed-delivery rollback
- Consent history, OAuth extension tables, and privacy-preserving authentication audit events
- Generic public failures to reduce enumeration
- Independent `AUTH_ENABLED` and `AUTH_REGISTRATION_ENABLED` flags
- Non-secret readiness diagnostics

### Guarded R2 media foundation

- Independent `MEDIA_UPLOADS_ENABLED` flag, false by default
- One-time D1 upload intents with token digests and expiry
- Server-generated R2 object keys
- JPEG, PNG, and WebP allowlist; SVG disabled
- 8 MB cap, raster signature checks, dimension limits, 40-megapixel cap, and raw SHA-256 checksums
- Expected MIME and byte-size matching
- Private originals and owner-only pending previews
- Contributor asset listing and editor attachment
- Editor/admin moderation queue at `/admin/media`
- Pending, approved, rejected, and quarantined states
- Required reasons for reject and quarantine
- Trigger-backed moderation history
- Anonymous delivery only for uploaded and approved assets
- Private no-store previews and immutable approved delivery with ETags
- Media readiness diagnostics and guarded activation workflow integration

### Initial recipe submission

- Browser-autosaved new-recipe editor
- Country, language, measurement, taxonomy, timing, yield, ingredients, and directions
- Dynamic rows, live preview, Worker validation, field errors, and JSON export
- Private hero-image attachment
- Protected `/api/recipes/submissions`
- Same-origin, signed CSRF, session CSRF, body-size, rate-limit, and canonical validation
- D1 category and media ownership/purpose/state/uniqueness checks
- Atomic first-submission batch for recipe and normalized relations
- Contributor-owned status page at `/account/submissions`
- Public queries restricted to `published`

### Editorial review and publication

- Private editor/admin queue at `/admin/recipes`
- Detailed review at `/admin/recipes/:id`
- Protected editor/admin editorial endpoint
- Publish, request-changes, and archive actions
- Publication gated on complete relational content and approved uploaded media
- Optimistic revision checks
- Final conditional publication update that rechecks media approval
- Required archival and requested-change reasons
- Trigger-backed editorial event history

### Requested changes and contributor revisions

- `review → draft` owner-only correction state
- Editor request reason of at least 10 characters
- Contributor status cards with lock and content revisions
- Owner-only editor at `/account/submissions/:id/edit`
- Recipe-specific browser autosave
- Eligible existing media restoration
- Replacement upload for rejected, quarantined, deleted, or unavailable media
- Protected `/api/recipes/:id/resubmit`
- `recipe-resubmit` CSRF, session CSRF, ownership, status, expected-revision, rate-limit, and canonical validation
- Separate `revision` and `content_revision`
- Unique temporary `revision_write_token`
- Every relational delete/insert guarded by the acquired token
- Stale requests return conflict without partial normalized-row deletion
- Atomic recipe, media, category, ingredient, direction, and snapshot replacement
- Immutable baseline and revised JSON snapshots in `recipe_revision_snapshots`
- Successful `draft → review` resubmission

### D1 schema and migrations

Authoritative nested sequence:

```text
migrations/d1/0001_initial/migration.sql
migrations/d1/0002_seed/migration.sql
migrations/d1/0003_market_coverage/migration.sql
migrations/d1/0004_auth_accounts/migration.sql
migrations/d1/0005_media_pipeline/migration.sql
migrations/d1/0006_recipe_editorial/migration.sql
migrations/d1/0007_recipe_revisions/migration.sql
```

`migrations_pattern` restricts Wrangler to the nested sequence. Root SQL files are legacy references only.

### Operations, validation, privacy, and security

- Pull-request CI on Node.js 24
- Exact seven-stage migration validation
- Catalogue and market validation
- Authentication, media, recipe-editorial, and contributor-revision invariants
- Browser JavaScript and service-worker syntax validation
- Operational script validation
- Cloudflare type generation and Astro Worker build
- Automatic D1-free deployment workflow
- Guarded D1 provisioning/migration workflow
- Guarded account workflow with independent registration, media, and recipe flags
- Deployment health checks for requested changes, contributor revisions, immutable snapshots, and optimistic locking
- CSP, HSTS, frame, MIME, referrer, permissions, and cross-origin controls
- Private account/admin/write route no-store/noindex controls
- Privacy disclosure for account, media, recipe, editorial reason, and snapshot storage
- Architecture, activation, test, rollback, status, and continuation documentation

## Current deployment mode

```text
wrangler.jsonc
  → static-fallback public data
  → no D1 trusted writes
```

Checked-in D1 values remain:

```text
AUTH_ENABLED=false
AUTH_REGISTRATION_ENABLED=false
MEDIA_UPLOADS_ENABLED=false
RECIPE_SUBMISSIONS_ENABLED=false
```

D1, accounts, contributor media, submissions, editorial decisions, and revisions are not required for the current public application and have not been activated.

## Guarded future activation path

```text
wrangler.d1.jsonc
  → provision D1, KV, and R2
  → apply seven migrations
  → deploy D1 reads with all trusted writes false
  → configure peppers, Turnstile, and optional email delivery
  → enable controlled sign-in
  → provision contributor/editor/admin accounts
  → test media moderation
  → optionally enable media uploads
  → test submission/editorial/revision/rollback flows
  → optionally enable recipe submissions and revisions
  → approve legal/email operations
  → enable public registration separately and last
```

Disabling recipe submissions closes first submissions, requested changes, resubmissions, publication, and archival writes without deleting normalized recipes, snapshots, audit events, approved media, or published recipe reads.

## Validation baseline

The last verified implementation head before documentation synchronization was:

```text
7ea198c57407f44dc130eb6c6936b8fb255ae91a
```

CI run `#290` passed all dependency, validation, operational-script, Cloudflare-type, and Astro Worker build steps. Documentation commits may move the branch, so always fetch PR `#1` before continuing.

## Remaining production and engineering phases

1. Provision a non-production D1/R2 environment and execute account, media, submission, revision, activation, and rollback matrices.
2. Approve Terms and Privacy for the operating company and jurisdictions.
3. Configure verification email provider/webhook and sender domain.
4. Provision initial administrator/editor credentials through a controlled process.
5. Implement privacy-safe image derivatives: EXIF/metadata stripping, orientation normalization, responsive WebP/AVIF variants, approved-only public delivery, regeneration, and cleanup.
6. Add contributor edits to published recipes, editorial editing, scheduled publishing, archive restoration, snapshot restore, and richer conflict resolution.
7. Add account-synchronized saves, shopping lists, meal plans, ratings, reviews, comments, and collections.
8. Add password reset, email change, account deletion, and account-administration interfaces.
9. Add nutrition, taxonomy, and localization administration, queued jobs, search indexing, recommendations, analytics, and advertising controls.
