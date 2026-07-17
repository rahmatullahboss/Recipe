# Ozzyl Recipes

An original, international recipe discovery and contributor platform built with Astro 7 and Cloudflare Workers. The initial audience focus is the United States, Canada, the United Kingdom, Australia, New Zealand, France, Germany, Switzerland, Sweden, and the Netherlands.

The project does not copy Allrecipes branding, source code, copyrighted recipe content, or its exact interface.

## Implemented product capabilities

### International discovery

- Cloudflare country detection prioritises recipes for the visitor's market.
- Visitors can manually switch markets from the global header.
- The selected market is stored in a first-party cookie for one year.
- Every supported market has a starter regional recipe in the D1-free catalogue.
- Country landing pages are available under `/markets/:country`.
- Category and cuisine landing pages are available under `/categories/:slug`.
- The full international catalogue remains available regardless of market.

### Recipe finder

The server-rendered finder and JSON API share one filtering engine:

- Keyword and ingredient search
- Country priority
- Category and cuisine
- Difficulty
- Maximum total cooking time
- Recommended, highest-rated, quickest, and most-popular sorting

The same repository contract works with the static catalogue and future D1 data.

### Cooking tools

- Adjustable servings with ingredient scaling
- Approximate US and metric measurement conversion
- Original-measurement mode for precision recipes
- Print-friendly recipe view and copy-link action
- Browser-local saved recipe collection
- One-click addition of currently displayed ingredient quantities to a shopping list
- One-click placement of a recipe on the next open meal-plan day
- Distraction-free guided cooking route at `/recipes/:slug/cook`
- Large step-by-step directions, progress tracking, keyboard navigation, countdown timers, completion sound, and supported screen wake lock

### Private kitchen planning

- Browser-local shopping list at `/shopping-list`
- Purchased-item checking, individual removal, clear-checked, clear-all, and copy-to-clipboard controls
- Browser-local seven-day meal planner at `/meal-plan`
- Previous/current/next week navigation, per-day recipe assignment, weekly copy, and week clearing
- Shopping and meal-plan counts shown in desktop and mobile navigation
- Cross-tab updates through storage events
- No account or server data transfer is required for these tools

### Offline and install foundation

- Web application manifest and branded SVG application icon
- Service worker registration on secure origins
- Network-first navigation caching with an offline fallback page
- Cache-first same-origin scripts, styles, images, and fonts
- Previously opened cacheable recipe pages can be revisited during temporary connection loss
- APIs and media routes are intentionally excluded from service-worker interception

### Contributor drafts

- Full recipe draft editor at `/recipes/new`
- Country, language, measurement, taxonomy, timing, yield, ingredients, and directions
- Browser autosave and recovery
- Live recipe-card preview
- Worker-side structured validation
- Field-level validation errors
- JSON draft export

Draft images and public publishing remain disabled until authentication, Turnstile, R2 upload authorization, and moderation are connected.

### Accessibility

- Keyboard skip link and visible focus states
- Responsive mobile navigation with current-page indicators
- Reduced-motion support
- Accessible labels for market selection, recipe controls, editor rows, timers, shopping items, and planning controls

### SEO and security

- Schema.org Recipe structured data
- Cuisine and category metadata
- Dynamic sitemap and robots endpoints
- Crawlable market and category pages
- Real HTTP 404 responses for unknown recipes, categories, and markets
- Personal/editor/planning routes marked `noindex`
- Astro middleware security headers
- Content Security Policy
- HSTS on HTTPS
- Frame, MIME-sniffing, referrer, permissions, and cross-origin protections
- Private routes and validation endpoints use `no-store`

### Integrity and operations

- Dependency-free validation of catalogue IDs, slugs, market coverage, taxonomy references, ingredient/step ordering, and D1 migration order
- Syntax validation for every public browser script and the service worker
- Runtime health diagnostics for data mode, market coverage, and Cloudflare binding readiness
- Credentialed deployment smoke tests for expected data mode and KV/R2/Images/D1 bindings

## Cloudflare architecture

| Concern | Current implementation |
| --- | --- |
| Frontend and SSR | Astro 7 on Cloudflare Workers |
| Static assets | Workers Static Assets |
| Current recipe data | Versioned TypeScript catalogue |
| Future relational data | D1 |
| Original media | R2 |
| Image optimisation | Cloudflare Images binding |
| Future sessions | Workers KV |
| Market detection | Cloudflare request `cf.country` |
| CI/CD | GitHub Actions + Wrangler Action v4 |
| Offline support | Web manifest + service worker runtime cache |
| Bot protection | Turnstile planned for account/write routes |
| Background work | Queues planned |
| Semantic search | Workers AI + Vectorize planned |

## Configuration modes

### Current D1-free production mode

`wrangler.jsonc` contains no D1 binding. The application automatically uses `src/data/fallback-recipes.ts`.

```bash
npm ci
npm run validate
npm run build
npm run deploy
```

### Future D1 mode

`wrangler.d1.jsonc` declares the `DB` binding and uses the migrations in `migrations/`.

```bash
npm run db:migrate:local
npm run build:d1
npm run deploy:d1
```

The D1 deployment command provisions the binding, applies remote migrations, and performs the final deployment. If a D1 query fails, public recipe discovery safely falls back to the versioned catalogue.

## Local development

Requirements: Node.js 22 or newer. GitHub CI uses Node.js 24.

```bash
npm ci
npm run validate
npm run dev
```

This starts the application in D1-free mode. Service-worker registration only runs in a secure browser context, so normal local HTTP development is not blocked by offline support.

To test the future database schema locally:

```bash
npm run db:migrate:local
npm run build:d1
```

## GitHub Actions

- `.github/workflows/ci.yml` validates the catalogue, migrations, browser-script syntax, installs locked dependencies, generates Cloudflare types, and builds the Astro Worker.
- `.github/workflows/deploy.yml` deploys the D1-free Worker after changes reach `main`, then verifies static data mode, ten markets, and KV/R2/Images bindings.
- `.github/workflows/enable-d1.yml` is manually triggered and requires typing `ENABLE_D1` before provisioning D1, applying migrations, deploying, and verifying database mode and all bindings.

Required GitHub `production` environment secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

See `docs/CLOUDFLARE_SETUP.md` for exact Cloudflare permissions and GitHub setup.

## Important routes

- `/` — personalised international homepage
- `/search` — advanced recipe finder
- `/markets` and `/markets/:country` — country discovery
- `/categories` and `/categories/:slug` — taxonomy discovery
- `/recipes/:slug` — interactive recipe detail
- `/recipes/:slug/cook` — private guided cooking mode
- `/saved` — private browser-local collection
- `/shopping-list` — private browser-local ingredient list
- `/meal-plan` — private browser-local weekly planner
- `/recipes/new` — private autosaved contributor draft editor
- `/offline` — service-worker navigation fallback
- `/manifest.webmanifest` and `/sw.js` — install and offline foundation
- `/api/recipes` — filtered recipe JSON API
- `/api/recipes/validate` — contributor draft validation API
- `/api/location` — persistent market selection
- `/api/health` — runtime, catalogue, and binding health diagnostics
- `/sitemap.xml` and `/robots.txt` — discovery controls

Example API request:

```text
/api/recipes?q=potato&country=DE&category=german&difficulty=easy&maxTime=60&sort=rating&limit=12
```

## Database migrations

- `0001_initial.sql` creates users, international recipes, localisation, nutrition, categories, ingredients, steps, ratings, saves, comments, and media metadata.
- `0002_seed.sql` creates the initial editor, taxonomy, and US/UK/France/Australia recipes.
- `0003_market_coverage.sql` adds Canada, New Zealand, Germany, Switzerland, Sweden, and Netherlands coverage.

Migration commands always use `wrangler.d1.jsonc`, keeping the current production deployment independent from the D1 account limit.

## Next engineering phases

1. Authentication, email verification, roles, secure KV sessions, and Turnstile
2. Signed R2 image uploads, image metadata, moderation, and Cloudflare Images delivery
3. D1-backed contributor publishing and editorial review workflow
4. Account-synchronised saves, shopping lists, meal plans, ratings, reviews, comments, and collections
5. Nutrition editing and verified conversion metadata
6. Admin taxonomy, localisation, and content moderation tools
7. Queued media/email jobs and search indexing
8. Workers AI + Vectorize recommendations
9. Consent-aware analytics and advertising integration
