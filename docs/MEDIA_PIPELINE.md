# Guarded R2 media pipeline

Contributor image upload, privacy-safe derivative generation and moderation are implemented but disabled by default. The checked-in configuration keeps:

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false",
"MEDIA_UPLOADS_ENABLED": "false",
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

Read [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md) for the complete project state. The executable synthetic test plan is documented in [`MEDIA_DERIVATIVE_TEST_MATRIX.md`](MEDIA_DERIVATIVE_TEST_MATRIX.md), and incident recovery is documented in [`MEDIA_DERIVATIVE_ROLLBACK.md`](MEDIA_DERIVATIVE_ROLLBACK.md).

## Storage and authority model

- D1 is authoritative for media ownership, original checksum/ETag, source and normalized dimensions, moderation state, derivative policy/source identity, generation leases, derivative checksums/ETags and cleanup state.
- R2 remains a private bucket. It stores immutable validated originals under `uploads/...` and policy/checksum-scoped transformed objects under `derivatives/...`.
- A key is never proof of authorization. Every preview or public response resolves the parent D1 asset first.
- The browser never chooses an R2 key and never receives reusable R2 credentials.
- Recipe records store a D1 media asset ID plus a Worker delivery URL; public reads remain `published`-only.
- Cloudflare Images is used through the `IMAGES` binding only for server-side byte transforms. A direct Cloudflare Images public URL is not used.

## Migration `0008_media_derivatives`

`0008_media_derivatives` is the eighth authoritative migration. It adds:

- `media_assets.source_orientation`;
- `media_assets.normalized_width` and `normalized_height`;
- `media_assets.original_deleted_at`;
- `media_derivative_jobs` for one active policy/source job per parent;
- `media_derivatives` for each width/format object and its checksum/ETag;
- indexes for ready delivery and cleanup;
- backfill of uploaded legacy assets to a pending `recipe-images-v1` job;
- triggers that immediately mark derivatives non-ready/cleanup-pending after rejection, quarantine or deletion;
- source-checksum regeneration triggers that invalidate stale variants.

The migration is additive. No remote D1 database was activated or modified by this implementation.

## Accepted originals

- JPEG, PNG and WebP only;
- maximum 8 MiB;
- minimum 320 × 240 **after EXIF orientation normalization**;
- maximum 12,000 pixels on either side;
- maximum 40 megapixels overall.

SVG and arbitrary binary uploads remain rejected. The Worker compares the declared MIME type with the raster signature, validates dimensions, parses orientation from JPEG APP1 EXIF, PNG `eXIf` and WebP `EXIF`, and stores the original SHA-256 and R2 ETag.

Original objects are always written with `private, no-store`. They are never returned by `/media/...`, even when approved.

## Upload and generation sequence

1. A verified contributor requests an upload intent.
2. Same-origin, purpose-bound signed CSRF, current-session CSRF, rate limit, filename, purpose, MIME, expected size and alt-text checks run.
3. D1 stores only the upload-token digest and expiry; the plaintext token is returned once.
4. The upload Worker verifies the raw body, normalized dimensions and source checksum, then atomically claims the intent.
5. The private original, D1 media asset and pending derivative job are committed as one logical upload operation.
6. Generation re-reads the original from private R2 and refuses to continue unless both source ETag and SHA-256 match D1.
7. A conditional D1 lease changes the job to `generating`; concurrent callers receive `busy`, and a stopped lease becomes reclaimable after five minutes.
8. Required JPEG/WebP variants and optional AVIF variants are generated, verified and stored under deterministic policy/source keys.
9. The job becomes `ready` only when every required JPEG/WebP variant is recorded. Optional AVIF failure never removes the mandatory fallback matrix.
10. Old policy/source objects are cleaned only after the current job is ready.

If generation fails after the upload is accepted, the original remains private and the job is `failed`. The asset cannot be approved or publicly delivered until guarded regeneration succeeds.

## Transformation policy `recipe-images-v1`

### Bounded widths

The policy generates `320`, `640`, `960` and `1280` widths, capped at the normalized source width. The source is never upscaled and duplicate widths collapse.

### Formats

- JPEG quality 82 is required and supplies the universal fallback. Transparent input is flattened onto white.
- WebP quality 82 is required.
- AVIF quality 72 is optional and attempted only through 960 pixels.

The runtime result MIME type is checked. An AVIF request that falls back to another format is not stored as AVIF; WebP/JPEG remain available.

### Orientation and metadata guarantees

Cloudflare Images applies source orientation during transform. The Worker also validates that output dimensions match the normalized aspect ratio. Generated objects are scanned before storage:

- JPEG rejects APP1, APP2, APP13 and comment segments;
- WebP rejects EXIF, XMP and ICC chunks;
- AVIF rejects known EXIF/XMP payload markers;
- output type and dimensions are verified through the Images binding.

This provides a fail-closed application guarantee rather than assuming encoding removed metadata.

## Idempotency, checksums and ETags

A derivative identity is:

```text
parent media ID + policy version + source SHA-256 + width + format
```

R2 keys use the same deterministic identity. D1 holds the generated byte size, output SHA-256 and R2 HTTP ETag. Delivery verifies R2 ETag and size against D1 before returning bytes. A mismatch returns `503` with no-store headers.

A ready job with the current policy and checksum is a no-op for normal regeneration. Editors/admins can request a guarded forced rewrite. Changing the policy constant creates a new namespace; changing the source checksum marks the job pending and old rows deleting.

## Moderation and ownership

The private queue at `/admin/media` remains restricted to verified editors/admins.

- Approval is a conditional D1 update that requires a current-policy ready job with a complete required matrix.
- Rejection or quarantine denies public delivery in D1 immediately, then deletes derivative rows/objects.
- Returning an asset to pending makes a cleaned/failed job regenerable.
- Contributors may regenerate only their own uploaded assets.
- Editors/admins may regenerate eligible assets and use the force option.
- Rejected/quarantined assets cannot regenerate until an authorized moderator returns them to pending.

Moderation does not publish a recipe. Recipe publication still independently checks uploaded/approved media in its atomic editorial transition.

## Delivery contract

Route:

```text
GET|HEAD /media/{original-r2-key}
```

The path identifies the parent only. The route never fetches the original key.

### Public

Public delivery requires all of the following:

- parent `upload_status='uploaded'`;
- parent `moderation_status='approved'`;
- parent source checksum present;
- current `recipe-images-v1` job `ready`;
- complete required JPEG/WebP count;
- current derivative row `ready`;
- derivative R2 object ETag and size matching D1.

The canonical query includes `v={policy}.{source-checksum-prefix}`. Missing/stale versions redirect to the canonical URL. `w` selects a bounded width; `Accept` negotiates AVIF, then WebP, then JPEG. `format=avif|webp|jpeg` requests an exact ready format.

Public responses use immutable one-year browser/shared cache headers, `Vary: Accept`, output ETag, `X-Content-SHA256`, `nosniff`, and same-site resource policy.

### Private previews

`?preview=1` is available only to the owner of a pending/approved asset or to an editor/admin. It still returns a transformed derivative, never the original. Every preview and preview error uses:

```text
Cache-Control: private, no-store
Vary: Cookie, Accept
```

## Guarded lifecycle routes

| Method and route | Purpose |
| --- | --- |
| `POST /api/media/intent` | Create a one-time upload authorization |
| `POST /api/media/upload` | Validate/store a private original and generate derivatives |
| `POST /api/media/{id}/derivatives` | Owner/editor guarded regeneration; editor force option |
| `POST /api/media/{id}/moderate` | Editor/admin moderation with approval derivative gate |
| `DELETE /api/media/{id}` | Owner/editor deletion after confirming no recipe references the asset |
| `GET|HEAD /media/{key}` | Approval-gated public derivative or authorized private derivative preview |

All mutation routes require authenticated sessions, same-origin checks and purpose-bound CSRF. Delete first changes D1 to `deleted`, making delivery impossible, then deletes derivatives and the private original. Partial cleanup therefore fails closed.

## Replacement semantics

Originals are immutable. Replacing a recipe image means uploading a new media asset and atomically attaching the new asset through the contributor revision flow. The previous asset is not silently deleted. After it is detached from every recipe, its owner or an editor/admin may delete it, triggering derivative and original cleanup.

## Health and guarded deployment

`/api/health` now reports:

- DB, private R2 and Images binding readiness;
- policy version, widths, required/optional formats and AVIF cap;
- original-public-delivery false;
- approval and ready-derivative public gates;
- orientation normalization and metadata verification;
- deterministic keys, idempotent leases, checksum regeneration and cleanup lifecycle.

The guarded activation workflow refuses to continue unless these capabilities and mandatory JPEG/WebP fallbacks are present. It does not generate sample media or approve content.

## Activation order

1. Keep all four checked-in flags false.
2. Provision D1/R2/KV/Images only in a controlled environment.
3. Apply all authoritative migrations through `0008_media_derivatives`.
4. Verify `/api/health` and guarded workflow capability assertions.
5. Run the complete synthetic fixture matrix in [`MEDIA_DERIVATIVE_TEST_MATRIX.md`](MEDIA_DERIVATIVE_TEST_MATRIX.md).
6. Confirm moderation staffing, retention, deletion, appeal and incident procedures.
7. Enable controlled authentication and provision test roles.
8. Enable media uploads only in controlled runtime configuration.
9. Exercise upload, private preview, regeneration, moderation, public fallback, cache and cleanup cases.
10. Enable recipe submissions separately only after media acceptance.

## Boundaries

- No deployment, remote D1 migration, account provisioning, real upload, recipe creation or moderation occurred in this phase.
- Automated malware and semantic content scanning are still not implemented.
- Optional AVIF depends on exact runtime output; JPEG/WebP are the approval requirement.
- R2 cleanup is synchronous and recoverable but no scheduled sweeper/queue consumer is included yet.
- Remote backups, cache purge procedures and legal retention policy remain operational responsibilities.
- Checked-in defaults remain disabled.
