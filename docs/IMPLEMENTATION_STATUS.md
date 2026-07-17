# Implementation Status

## Completed

### Platform and markets

- Astro 7 SSR on Cloudflare Workers
- International Tier-1 positioning with no country-specific brand bias
- Supported markets: US, Canada, UK, Australia, New Zealand, France, Germany, Switzerland, Sweden, and the Netherlands
- Cloudflare country detection with persistent manual override
- At least one fallback recipe for every supported market
- D1-free static catalogue for immediate deployment
- Optional D1 repository with automatic public fallback

### Discovery

- Market-aware homepage, search, JSON API, and cards
- Keyword, ingredient, category, difficulty, time, and sort filters
- Country, category, and cuisine landing pages
- Shared filtering behavior across static and D1 repositories
- Recipe structured data, sitemap, and robots endpoints

### Cooking and private planning

- Serving adjustment and approximate US/metric conversion
- Original-measurement, print, and copy-link modes
- Browser-local saves and collection page
- Recipe-to-shopping-list transfer
- Browser-local shopping list controls
- Browser-local seven-day meal planner
- Recipe-to-next-open-day planning
- Guided cooking route, keyboard navigation, timers, finish feedback, and supported wake lock
- Cross-tab updates and private-route caching/privacy controls

### Offline and install foundation

- Web application manifest and branded icon
- Secure-context service-worker registration
- Network-first navigation and offline fallback
- Cache-first same-origin static resources
- API and media routes excluded from interception

### Contributor foundation

- Browser-autosaved international recipe draft editor
- Country, language, measurement, taxonomy, timing, ingredients, and directions
- Dynamic rows, live preview, Worker validation, field errors, and JSON export
- Optional media asset reference retained in the structured local draft

### D1 schema and migration readiness

- Recipe, localisation, nutrition, taxonomy, ingredient, step, rating, save, comment, and media schema
- Authoritative nested Wrangler migration sequence:
  - `migrations/d1/0001_initial/migration.sql`
  - `migrations/d1/0002_seed/migration.sql`
  - `migrations/d1/0003_market_coverage/migration.sql`
  - `migrations/d1/0004_auth_accounts/migration.sql`
  - `migrations/d1/0005_media_pipeline/migration.sql`
- `migrations_pattern` restricts Wrangler to the authoritative nested sequence
- Separate D1-free and D1-enabled Wrangler configurations

### D1 authentication foundation

- D1 user identities with case-insensitive email and username uniqueness
- Pending, active, locked, suspended, and deleted account states
- PBKDF2-HMAC-SHA256 password hashes with 600,000 iterations, unique salt, and server-only pepper
- Verified-active-only KV sessions with HTTP-only production cookies
- D1 `auth_version` session revocation
- Purpose-bound signed CSRF tokens
- KV-backed login and registration rate limits
- Server-side Turnstile Siteverify with action and hostname checks
- Five-attempt, 15-minute account lockout
- D1 email verification and reset-token digest table
- Single-use 30-minute email verification tokens
- Authenticated verification-email webhook with delivery rollback
- D1 consent history, OAuth identity extension, and privacy-preserving audit events
- Generic public errors to reduce account enumeration
- Independent `AUTH_ENABLED` and `AUTH_REGISTRATION_ENABLED` fail-closed flags
- Non-secret auth readiness diagnostics in `/api/health`
- Terms draft and versioned consent input

### Guarded R2 media foundation

- Independent `MEDIA_UPLOADS_ENABLED` flag, disabled in checked-in configuration
- D1 one-time upload intents with token digests and ten-minute expiry
- Server-generated R2 object keys and contributor ownership
- JPEG, PNG, and WebP allowlist; SVG disabled
- 8 MB size cap, raster signature checks, dimension limits, and raw SHA-256 checksums
- Expected MIME and byte-size matching before R2 storage
- Private pending assets and owner-only previews
- Contributor asset listing and local draft attachment
- Editor/admin moderation queue at `/admin/media`
- Approved, rejected, quarantined, and pending states
- Server-enforced reasons for reject and quarantine decisions
- D1 trigger-backed moderation transition history
- Anonymous R2 delivery only for uploaded and approved D1 assets
- Private no-store preview caching and immutable approved delivery with ETags
- Non-secret media readiness diagnostics in `/api/health`
- Dedicated media architecture, activation, testing, and rollback documentation

### Operations and security

- Pull-request CI on Node.js 24
- Catalogue, taxonomy, market, nested migration, auth-invariant, media-invariant, and browser-script validation
- Automatic D1-free deployment workflow
- Guarded future D1 provisioning/migration workflow
- Guarded account workflow with independent registration and contributor-media inputs
- Credential and deployed-health checks
- R2 missing-binding handling
- Astro middleware CSP, HSTS, frame, MIME, referrer, permissions, and cross-origin controls
- Private route `no-store` and `noindex` controls
- Cloudflare, D1 authentication, media activation, and rollback documentation

## Current deployment mode

```text
wrangler.jsonc → static-fallback data mode → no D1 account or media writes
```

D1, accounts, and contributor media are not required for the current public application.

## Future guarded D1 deployment

```text
wrangler.d1.jsonc
  → provision DB and R2 bindings
  → apply authoritative nested migrations
  → deploy D1 recipe reads
  → keep AUTH_ENABLED=false
  → keep AUTH_REGISTRATION_ENABLED=false
  → keep MEDIA_UPLOADS_ENABLED=false
  → configure secrets, Turnstile, and email webhook
  → enable sign-in
  → provision editor/admin accounts and test moderation
  → optionally enable contributor media
  → approve legal/email testing
  → enable registration separately and last
```

Public recipe queries fall back to the versioned catalogue if D1 reads fail. Turning media uploads off stops new intents and raw uploads without removing approved public assets or editorial access.

## Remaining production phases

1. Provision a non-production D1/R2 environment and execute the documented account and media test matrices
2. Approve Terms and Privacy text for the operating company and jurisdiction
3. Configure the verification email provider/webhook and sender domain
4. Provision initial administrator/editor credentials through a controlled process
5. Add privacy-safe image derivatives, metadata stripping, orientation normalisation, and optional automated scanning
6. Implement D1-backed recipe submission, asset ownership checks, editorial review, and publishing transactions
7. Add account-synchronised saves, shopping lists, meal plans, ratings, reviews, comments, and collections
8. Add password reset, email change, account deletion, and administration interfaces using the prepared D1 tables
9. Add nutrition editing, taxonomy/localisation administration, queued jobs, search indexing, recommendations, analytics, and advertising controls
