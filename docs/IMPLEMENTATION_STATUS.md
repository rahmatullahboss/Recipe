# Implementation Status

## Completed

### Platform and markets

- Astro 7 SSR on Cloudflare Workers
- International Tier-1 positioning with no country-specific brand bias
- Supported market model for US, Canada, UK, Australia, New Zealand, France, Germany, Switzerland, Sweden, and the Netherlands
- Cloudflare edge-country detection with a persistent manual override
- At least one starter recipe for every supported market
- D1-free static catalogue for immediate deployment
- Optional D1 data adapter with automatic public fallback

### Discovery

- Market-aware homepage, search, JSON API, and recipe cards
- Advanced keyword, ingredient, category, difficulty, time, and sorting filters
- Country landing pages
- Category and cuisine directory and landing pages
- Shared filtering behavior across static and D1 repositories
- Schema.org recipe metadata, sitemap, and robots endpoints

### Cooking experience

- Adjustable recipe servings
- Approximate US and metric ingredient conversion
- Original-measurement mode
- Print and copy-link actions
- Browser-local recipe saves and private saved collection page
- One-click recipe ingredient transfer to the shopping list
- One-click placement on the next open meal-plan day
- Guided cooking route with large sequential steps
- Previous/next and keyboard navigation
- Countdown timers, finish feedback, and supported screen wake lock

### Private kitchen planning

- Browser-local shopping list with check, remove, clear, and copy controls
- Browser-local seven-day meal planner
- Previous/current/next week navigation
- Per-day recipe selection, weekly copy, and clearing
- Cross-tab state updates
- Navigation counts for outstanding shopping items and planned meals
- Privacy disclosure and `noindex`/`no-store` controls

### Offline and install foundation

- Web application manifest
- Branded SVG application icon
- Secure-context service-worker registration
- Network-first navigation caching
- Cache-first same-origin static resources
- Offline fallback page
- API and media routes excluded from service-worker interception

### Contributor foundation

- Browser-autosaved international recipe draft editor
- Country, language, measurement, taxonomy, timing, ingredients, and directions fields
- Dynamic ingredient and step rows
- Live preview
- Cloudflare Worker validation API
- Strict shared payload validation and JSON export

### D1 readiness

- International recipe, category, ingredient, step, rating, save, comment, and media schema
- Explicit recipe measurement systems
- Recipe localisation table
- Recipe nutrition table
- Country/language indexes
- Three ordered migrations including complete market coverage
- Separate default and D1-enabled Wrangler configurations

### Operations and security

- Pull-request CI passing on Node.js 24
- Latest verified CI run recorded in the pull request
- Automatic D1-free production deployment workflow
- Credential validation and deployed health smoke test
- Guarded future D1 provisioning/migration workflow
- R2 media route with missing-binding handling
- Astro middleware security headers and CSP
- Private route no-store and noindex controls
- Catalogue, taxonomy, market, and migration integrity checks
- Syntax checking for every public browser script and service worker
- Cloudflare/GitHub setup and rollback documentation

## Current deployment mode

```text
wrangler.jsonc → static-fallback data mode
```

D1 is not required. The current application can be deployed after the Cloudflare account ID and API token are stored in the GitHub `production` environment.

## Future D1 switch

```text
wrangler.d1.jsonc
  → provision DB binding
  → apply migrations
  → final deployment
  → d1 data mode
```

The application automatically selects D1 when the binding is available and falls back to the versioned catalogue if a public database query fails.

## Remaining production phases

1. Authentication, email verification, roles, secure KV sessions, and Turnstile
2. Signed R2 uploads and media moderation
3. D1-backed recipe publishing and editorial review
4. Account-synchronised saves, shopping lists, meal plans, ratings, reviews, comments, and collections
5. Nutrition editing and verified conversion metadata
6. Taxonomy, localisation, and moderation administration
7. Queued media/email jobs and search indexing
8. Workers AI + Vectorize recommendations
9. Consent-aware analytics and advertising integration
