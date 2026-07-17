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

### D1 schema and migration readiness

- Recipe, localisation, nutrition, taxonomy, ingredient, step, rating, save, comment, and media schema
- Authoritative nested Wrangler migration sequence:
  - `migrations/d1/0001_initial/migration.sql`
  - `migrations/d1/0002_seed/migration.sql`
  - `migrations/d1/0003_market_coverage/migration.sql`
  - `migrations/d1/0004_auth_accounts/migration.sql`
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

### Operations and security

- Pull-request CI on Node.js 24
- Catalogue, taxonomy, market, nested migration, auth-invariant, and browser-script validation
- Automatic D1-free deployment workflow
- Guarded future D1 provisioning/migration workflow
- Credential and deployed-health checks
- R2 missing-binding handling
- Astro middleware CSP, HSTS, frame, MIME, referrer, permissions, and cross-origin controls
- Private route `no-store` and `noindex` controls
- Cloudflare, D1 authentication, activation, and rollback documentation

## Current deployment mode

```text
wrangler.jsonc → static-fallback data mode → no D1 account writes
```

D1 and accounts are not required for the current public application.

## Future D1 deployment

```text
wrangler.d1.jsonc
  → provision DB binding
  → apply authoritative nested migrations
  → deploy D1 recipe reads
  → keep AUTH_ENABLED=false
  → configure secrets, Turnstile, and email webhook
  → enable sign-in
  → approve legal/email testing
  → enable registration last
```

Public recipe queries fall back to the versioned catalogue if D1 reads fail.

## Remaining production phases

1. Provision D1 and execute the documented non-production authentication test matrix
2. Approve Terms and Privacy text for the operating company and jurisdiction
3. Configure the verification email provider/webhook and sender domain
4. Provision initial administrator/editor credentials through a controlled process
5. Signed R2 uploads, media metadata, and moderation
6. D1-backed recipe publishing and editorial review
7. Account-synchronised saves, shopping lists, meal plans, ratings, reviews, comments, and collections
8. Password reset, email change, account deletion, and administration interfaces using the prepared D1 tables
9. Nutrition editing, taxonomy/localisation administration, queued jobs, search indexing, recommendations, analytics, and advertising controls
