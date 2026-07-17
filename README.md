# Ozzyl Recipes

A Cloudflare-native recipe discovery and publishing platform inspired by the information architecture of large recipe communities, while using an original brand, interface, database, and content.

## Current foundation

- Astro server-side rendering on Cloudflare Workers
- Workers Static Assets for CSS, SVG, and browser assets
- Cloudflare D1 for recipes, users, categories, ingredients, steps, ratings, saves, comments, and media metadata
- Cloudflare R2 binding for user-uploaded recipe photos and future video assets
- Cloudflare KV binding for sessions and lightweight cached state
- Cloudflare Images binding for responsive image transformation
- Server-rendered homepage, recipe search, and dynamic recipe detail pages
- Recipe structured data for search-engine rich results
- Cached JSON recipe API and Worker health endpoint
- Responsive original UI with starter Bangladeshi and international recipes

## Cloudflare architecture

| Concern | Cloudflare service |
| --- | --- |
| Frontend and SSR | Workers + Astro |
| Static assets | Workers Static Assets |
| Relational data | D1 |
| Original media | R2 |
| Image optimization | Images binding |
| Sessions | Workers KV |
| Bot protection | Turnstile (authentication and submission phase) |
| Background work | Queues (planned) |
| Semantic recipe search | Workers AI + Vectorize (planned) |

This project does not copy Allrecipes branding, source code, copyrighted recipe content, or its exact interface.

## Local development

Requirements: Node.js 22 or newer and a Cloudflare account.

```bash
npm install
npm run db:migrate:local
npm run dev
```

Wrangler automatically creates persistent local versions of the declared D1, R2, and KV bindings.

## First Cloudflare deployment

```bash
npx wrangler login
npm run deploy
npm run db:migrate:remote
```

Wrangler 4.45+ can automatically provision the D1 database, R2 bucket, and KV namespace because their bindings are declared without account-specific IDs. The first local deployment can write the generated IDs back into `wrangler.jsonc`.

Update `PUBLIC_SITE_URL` in `wrangler.jsonc` after assigning the production domain.

## Important routes

- `/` — discovery homepage
- `/search?q=chicken` — server-rendered recipe search
- `/recipes/:slug` — recipe details and structured data
- `/api/recipes?q=chicken&limit=12` — cached JSON API
- `/api/health` — Worker health check

## Database

Migrations are stored in `migrations/`:

- `0001_initial.sql` creates the production-oriented schema.
- `0002_seed.sql` adds starter categories, recipes, ingredients, and steps.

Apply migrations after changing the schema:

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

## Next implementation phases

1. Authentication, email verification, roles, and Turnstile validation
2. Recipe editor, moderation workflow, and signed R2 uploads
3. Ratings, reviews, comments, saves, and personal collections
4. Advanced filters and D1-backed category/cuisine pages
5. Queued media processing, email jobs, and search indexing
6. Workers AI + Vectorize semantic search and recommendations
7. Admin dashboard, analytics, sitemap generation, and ad placements
