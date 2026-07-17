# Implementation Status

## Completed

- International Tier-1 positioning with no country-specific brand bias
- Supported market model for US, Canada, UK, Australia, New Zealand, France, Germany, Switzerland, Sweden, and the Netherlands
- Cloudflare edge-country detection with a persistent manual override
- Market-aware homepage, search, JSON API, recipe cards, and country landing pages
- D1-free static recipe catalogue for immediate deployment
- Optional D1 data adapter with the same application interface
- International D1 schema and seed migrations
- Separate default and D1-enabled Wrangler configurations
- Astro 7 Cloudflare Workers SSR entrypoint and current direct binding access pattern
- R2 media route with missing-binding handling
- Recipe structured data, sitemap, and robots endpoints
- Privacy disclosure for country metadata and preference cookies
- Pull-request CI, production deployment, and guarded future D1 migration workflows
- Cloudflare/GitHub setup and rollback documentation

## Current deployment mode

```text
wrangler.jsonc → static-fallback data mode
```

D1 is not required for the current deployment.

## Future D1 switch

```text
wrangler.d1.jsonc → DB binding → migrations → d1 data mode
```

The application checks for the `DB` binding at runtime and automatically selects the correct repository implementation.

## Next engineering phase

1. Authentication and Turnstile
2. Contributor recipe editor
3. Signed R2 uploads and media moderation
4. Unit conversion and nutrition data
5. Ratings, saves, comments, and collections
6. Country/cuisine taxonomy administration
7. Search indexing and recommendation infrastructure
8. Consent-aware analytics and advertising integration
