# Ozzyl Recipes

An international, Cloudflare-native recipe discovery platform focused initially on Tier-1 markets including the United States, Canada, the United Kingdom, Australia, New Zealand, France, Germany, Switzerland, Sweden, and the Netherlands.

The product uses an original brand, interface, database design, and recipe content. It does not copy Allrecipes branding, source code, copyrighted recipe content, or its exact interface.

## Product direction

- Recipes are tagged by country and language.
- Cloudflare's request country is used to prioritise the visitor's local market.
- Visitors can manually change their preferred market from the global header.
- The market override is stored in a cookie for one year.
- The full international catalogue remains discoverable regardless of the selected market.
- US and metric measurement support is modelled per market and will be expanded into automatic ingredient conversion.

## Current foundation

- Astro 7 server-side rendering on Cloudflare Workers
- Workers Static Assets for CSS, SVG, and browser assets
- International static recipe catalogue for deployment without D1
- Optional D1 repository adapter using the same application interface
- D1 migrations prepared for country-aware recipes, users, categories, ingredients, steps, ratings, saves, comments, and media metadata
- R2 binding for future recipe photos and video assets
- KV binding for sessions and lightweight state
- Cloudflare Images binding for responsive image transformation
- Server-rendered homepage, market-aware search, and dynamic recipe details
- Recipe structured data with cuisine metadata
- Market-aware JSON recipe API and health endpoint
- Automatic GitHub Actions deployment to Cloudflare Workers
- Guarded manual workflow for future D1 migration and deployment

## Cloudflare architecture

| Concern | Current service |
| --- | --- |
| Frontend and SSR | Cloudflare Workers + Astro 7 |
| Static assets | Workers Static Assets |
| Current recipe data | Versioned static TypeScript catalogue |
| Future relational data | D1 |
| Original media | R2 |
| Image optimisation | Images binding |
| Sessions | Workers KV |
| Country detection | Cloudflare request `cf.country` |
| Bot protection | Turnstile (planned) |
| Background work | Queues (planned) |
| Semantic search | Workers AI + Vectorize (planned) |

## Configuration modes

### Current D1-free production mode

`wrangler.jsonc` is the default deployment configuration. It contains no D1 binding, so the application uses `src/data/fallback-recipes.ts` automatically.

```bash
npm ci
npm run build
npm run deploy
```

### Future D1 mode

`wrangler.d1.jsonc` contains the future `DB` binding and points to the existing migrations.

```bash
npm run db:migrate:local
npm run build:d1
npm run db:migrate:remote
npm run deploy:d1
```

The application detects whether `env.DB` exists. No route or component needs to change when switching from static data to D1.

## Local development

Requirements: Node.js 22 or newer. CI uses Node.js 24.

```bash
npm ci
npm run dev
```

This starts the application in D1-free mode with the international fallback catalogue.

To test the future D1 setup locally:

```bash
npm run db:migrate:local
npm run build:d1
```

## GitHub Actions

- `.github/workflows/ci.yml` validates every pull request.
- `.github/workflows/deploy.yml` deploys the D1-free Worker after changes reach `main`.
- `.github/workflows/enable-d1.yml` is manually triggered and requires typing `ENABLE_D1` before it applies remote migrations and deploys the D1-enabled configuration.

Required GitHub production environment secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

See `docs/CLOUDFLARE_SETUP.md` for the exact Cloudflare and GitHub setup.

## Important routes

- `/` — personalised international discovery homepage
- `/search?q=chicken` — market-aware server-rendered search
- `/recipes/:slug` — recipe details and structured data
- `/api/location` — stores the visitor's market override
- `/api/recipes?q=chicken&limit=12&country=US` — market-aware JSON API
- `/api/health` — runtime and active data-mode health check

## Database migrations

- `migrations/0001_initial.sql` creates the international production schema.
- `migrations/0002_seed.sql` adds Tier-1 starter recipes and related records.

Migration commands always use `wrangler.d1.jsonc`, so the default deployment remains independent from the current D1 account limit.

## Next implementation phases

1. Authentication, email verification, roles, and Turnstile validation
2. Recipe editor, country/language fields, moderation, and signed R2 uploads
3. Measurement conversion and nutrition modelling
4. Ratings, reviews, comments, saves, and personal collections
5. Country, cuisine, ingredient, diet, occasion, and cooking-time landing pages
6. Queued media processing, email jobs, sitemap generation, and search indexing
7. Workers AI + Vectorize semantic search and recommendations
8. Admin dashboard, analytics, consent controls, and advertising placements
