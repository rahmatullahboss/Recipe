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
- Print-friendly recipe view
- Copy-link action
- Browser-local saved recipe collection

### Contributor drafts

- Full recipe draft editor at `/recipes/new`
- Country, language, measurement, taxonomy, timing, yield, ingredients, and directions
- Browser autosave and recovery
- Live recipe-card preview
- Worker-side structured validation
- Field-level validation errors
- JSON draft export

Draft images and public publishing remain disabled until authentication, Turnstile, R2 upload authorization, and moderation are connected.

### SEO and security

- Schema.org Recipe structured data
- Cuisine and category metadata
- Dynamic sitemap and robots endpoints
- Crawlable market and category pages
- Real HTTP 404 responses for unknown recipes, categories, and markets
- Personal/editor routes marked `noindex`
- Astro middleware security headers
- Content Security Policy
- HSTS on HTTPS
- Frame, MIME-sniffing, referrer, permissions, and cross-origin protections
- Private routes and validation endpoints use `no-store`

### Integrity and operations

- Dependency-free validation of catalogue IDs, slugs, market coverage, taxonomy references, ingredient/step ordering, and D1 migration order
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

This starts the application in D1-free mode.

To test the future database schema locally:

```bash
npm run db:migrate:local
npm run build:d1
```

## GitHub Actions

- `.github/workflows/ci.yml` validates the catalogue and migrations, installs locked dependencies, generates Cloudflare types, and builds the Astro Worker.
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
- `/saved` — private browser-local collection
- `/recipes/new` — private autosaved contributor draft editor
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
4. Account-synchronised saves, ratings, reviews, comments, and collections
5. Nutrition editing and verified conversion metadata
6. Admin taxonomy, localisation, and content moderation tools
7. Queued media/email jobs and search indexing
8. Workers AI + Vectorize recommendations
9. Consent-aware analytics and advertising integration
