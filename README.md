# Ozzyl Recipes

An original international recipe discovery, kitchen-planning, and contributor platform built with Astro 7 and Cloudflare Workers. The initial audience focus is the United States, Canada, the United Kingdom, Australia, New Zealand, France, Germany, Switzerland, Sweden, and the Netherlands.

The project does not copy Allrecipes branding, source code, copyrighted recipe content, or its exact interface.

## Implemented product capabilities

### International discovery

- Cloudflare country detection prioritises recipes for the visitor's market.
- Visitors can manually switch markets from the global header.
- Every supported market has a starter regional recipe in the D1-free catalogue.
- Country pages are available under `/markets/:country`.
- Category and cuisine pages are available under `/categories/:slug`.
- The full international catalogue remains available regardless of market.

### Recipe finder

The server-rendered finder and JSON API share keyword, ingredient, country, category, cuisine, difficulty, maximum-time, and sorting behavior across static fallback and future D1 repositories.

### Cooking and kitchen tools

- Adjustable servings and approximate US/metric conversion
- Original-measurement, print, and copy-link modes
- Browser-local saved recipes
- Recipe ingredient transfer to `/shopping-list`
- Seven-day browser-local planner at `/meal-plan`
- One-click placement on the next open planning day
- Guided cooking at `/recipes/:slug/cook` with progress, keyboard controls, countdown timers, completion feedback, and supported wake lock
- Cross-tab kitchen-state updates and navigation counts

### Offline and install foundation

- Web application manifest and branded icon
- Service-worker registration on secure origins
- Network-first navigation caching and offline fallback
- Cache-first same-origin scripts, styles, images, and fonts
- API and media routes excluded from service-worker interception

### Contributor drafts

- Browser-autosaved editor at `/recipes/new`
- Country, language, measurement, taxonomy, timing, yield, ingredients, and directions
- Dynamic rows, live preview, Worker validation, field errors, and JSON export

Draft images and public publishing remain disabled until signed R2 uploads, moderation, and D1 write workflows are enabled.

### D1 authentication foundation

The account implementation is complete in code but disabled by default until D1 and production dependencies are ready.

- D1 identities with case-insensitive email and username uniqueness
- Pending, active, locked, suspended, and deleted states
- PBKDF2-HMAC-SHA256 at 600,000 iterations with unique salt and server-only pepper
- Verified-active-only sessions stored in Workers KV
- HTTP-only production cookie with `__Host-` prefix
- D1 `auth_version` session revocation
- Signed, purpose-bound, time-limited CSRF tokens
- KV-backed login and registration rate limits
- Server-side Turnstile Siteverify with action and hostname validation
- Five-attempt, 15-minute lockout
- D1 token digests for verification/reset workflows
- Single-use 30-minute email verification
- Authenticated verification-email webhook with failed-delivery rollback
- D1 consent history, OAuth extension tables, and privacy-preserving audit events
- Independent fail-closed flags for sign-in and registration
- Non-secret readiness details in `/api/health`

No pending or unverified account can create a session. Public registration remains closed until email delivery, legal review, Turnstile, D1, KV, and secrets are verified.

### Accessibility, SEO, and security

- Keyboard skip link, visible focus, mobile navigation, reduced-motion support, and labelled controls
- Schema.org Recipe metadata, sitemap, robots, and real HTTP 404 responses
- Personal/editor/planning/account routes use `noindex` and `no-store` where appropriate
- Astro middleware CSP, HSTS, frame, MIME, referrer, permissions, and cross-origin protections
- Syntax validation for public scripts and service worker
- Catalogue, taxonomy, market, nested migration, and authentication-invariant validation

## Cloudflare architecture

| Concern | Implementation |
| --- | --- |
| Frontend and SSR | Astro 7 on Cloudflare Workers |
| Static assets | Workers Static Assets |
| Current public recipe data | Versioned TypeScript catalogue |
| Future relational data and accounts | D1 |
| Sessions and lightweight security state | Workers KV |
| Original media | R2 |
| Image optimisation | Cloudflare Images binding |
| Bot protection | Turnstile |
| Verification delivery | Authenticated HTTPS webhook |
| Market detection | Cloudflare request `cf.country` |
| Offline support | Manifest + service worker |
| CI/CD | GitHub Actions + Wrangler Action v4 |

## Configuration modes

### Current D1-free production

`wrangler.jsonc` has no D1 binding. Public discovery and browser-local kitchen features work immediately.

```bash
npm ci
npm run validate
npm run build
npm run deploy
```

### Future D1 deployment

`wrangler.d1.jsonc` declares D1 and uses an authoritative nested migration layout.

```bash
npm run db:migrate:local
npm run build:d1
npm run deploy:d1
```

The D1 config keeps these values disabled by default:

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false"
```

D1 recipe reads can therefore be enabled before account access. Sign-in is activated only after secrets and bindings are ready; public registration is enabled last.

## Authoritative D1 migrations

Wrangler applies only:

```text
migrations/d1/0001_initial/migration.sql
migrations/d1/0002_seed/migration.sql
migrations/d1/0003_market_coverage/migration.sql
migrations/d1/0004_auth_accounts/migration.sql
```

`wrangler.d1.jsonc` uses:

```jsonc
"migrations_pattern": "migrations/d1/*/migration.sql"
```

The fourth migration adds user security fields, case-insensitive indexes, token digests, OAuth identities, consent history, and audit events. Root-level SQL files are legacy references and are not part of the Wrangler execution path.

## Local development

Requirements: Node.js 22 or newer. CI uses Node.js 24.

```bash
npm ci
npm run validate
npm run dev
```

This starts the D1-free application. To test the future schema locally:

```bash
npm run db:migrate:local
npm run build:d1
```

Keep account flags disabled unless the local D1, KV, Turnstile test values, password peppers, and verification webhook are intentionally configured.

## GitHub Actions

- `.github/workflows/ci.yml` validates catalogue, browser scripts, authoritative migrations, authentication invariants, Cloudflare types, and the Worker build.
- `.github/workflows/deploy.yml` deploys the D1-free Worker from `main` and verifies static mode plus KV/R2/Images bindings.
- `.github/workflows/enable-d1.yml` requires the exact `ENABLE_D1` confirmation before provisioning D1, applying migrations, and verifying D1 mode.

Required GitHub `production` environment secrets for deployment:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

Account secrets are configured later as Cloudflare Worker secrets and are never committed.

## Important routes

- `/` — market-aware homepage
- `/search` — advanced finder
- `/markets` and `/markets/:country` — country discovery
- `/categories` and `/categories/:slug` — taxonomy discovery
- `/recipes/:slug` — recipe detail and tools
- `/recipes/:slug/cook` — guided cooking
- `/saved`, `/shopping-list`, `/meal-plan` — private browser-local tools
- `/recipes/new` — autosaved contributor draft
- `/login`, `/register`, `/verify-email`, `/account` — fail-closed D1 account routes
- `/terms` and `/privacy` — current policy drafts/disclosure
- `/offline`, `/manifest.webmanifest`, `/sw.js` — offline/install foundation
- `/api/recipes` and `/api/recipes/validate` — recipe APIs
- `/api/auth/*` — CSRF, Turnstile, D1, and KV protected account APIs
- `/api/health` — runtime, binding, catalogue, and non-secret auth readiness

## Activation documentation

- `docs/CLOUDFLARE_SETUP.md` — Cloudflare/GitHub deployment and D1 boundaries
- `docs/D1_AUTH_SETUP.md` — exact D1 authentication secrets, webhook contract, activation order, testing, and rollback
- `docs/IMPLEMENTATION_STATUS.md` — completed and remaining scope

## Remaining production phases

1. Provision D1 and run the documented authentication test matrix outside production
2. Approve legal policies and configure the verification sender/webhook
3. Provision initial operational administrator/editor credentials
4. Signed R2 uploads, image delivery, and media moderation
5. D1-backed recipe publishing and editorial review
6. Account-synchronised kitchen data, ratings, reviews, comments, and collections
7. Password reset, email change, deletion, and account administration interfaces using the prepared tables
8. Nutrition administration, queued jobs, search indexing, recommendations, analytics, and advertising controls
