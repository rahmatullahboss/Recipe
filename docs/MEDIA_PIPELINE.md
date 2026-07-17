# Guarded R2 Media Pipeline

Contributor image upload and moderation are implemented but disabled by default. The checked-in D1 configuration keeps:

```jsonc
"MEDIA_UPLOADS_ENABLED": "false"
```

Read [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md) for the complete project state and continuation prompt.

## Current storage model

- Cloudflare D1 stores one-time upload-intent digests, expected file metadata, ownership, checksums, dimensions, alternative text, lifecycle state, and moderation history.
- Cloudflare R2 stores each validated original raster image under a server-generated key.
- The browser never selects an R2 key and never receives reusable storage credentials.
- Recipe editors store only a D1 media asset identifier.
- First submission and resubmission re-check media ownership, purpose, upload state, moderation state, and one-recipe assignment.
- Recipe publication re-checks uploaded/approved media inside the final conditional D1 write.

Originals remain private unless the D1 delivery rules permit access. Privacy-safe derivative generation is not implemented yet.

## Accepted originals

- JPEG
- PNG
- WebP
- Maximum 8 MB
- Minimum 320 × 240 pixels
- Maximum 12,000 pixels on either side
- Maximum 40 megapixels overall

SVG and arbitrary binary uploads are rejected. The Worker compares declared MIME with the raster signature, parses dimensions, verifies expected byte size, and stores a SHA-256 checksum of the original bytes.

## Upload sequence

1. A verified signed-in contributor requests an upload intent.
2. The request passes same-origin, purpose-bound signed CSRF, current-session CSRF, rate-limit, type, size, filename, purpose, and alternative-text checks.
3. D1 stores the intent token digest and expiry. The plaintext token is returned only once.
4. The browser sends the raw file body to the Worker with the one-time bearer token.
5. The Worker verifies expected metadata, raster signature, dimensions, and limits, then atomically consumes the intent.
6. The validated original is written privately to R2 and a pending media asset is written to D1.
7. The owner may privately preview an eligible asset; anonymous delivery remains denied while unapproved.

## Moderation

The private queue at `/admin/media` is restricted to verified editor and administrator accounts.

Editors can:

- approve an asset;
- reject an asset with a reason;
- quarantine an asset with a reason;
- return an asset to pending review.

Every accepted transition records moderator, previous state, next state, reason, and timestamp. Rejected and quarantined images cannot be attached to a new or revised recipe and cannot be served anonymously.

## Current delivery rules

- Anonymous requests receive only D1 assets whose state is both `uploaded` and `approved`.
- Owners can privately preview their own eligible assets.
- Editors and administrators can privately preview moderation assets.
- Private previews use `private, no-store` and vary by cookie.
- Approved original delivery uses immutable public caching and ETags.
- Responses use `nosniff` and same-site cross-origin resource policy headers.
- A guessed or leaked R2 key is insufficient without a matching approved D1 record.

## Recipe integration

### First submission

The server requires an uploaded `recipe_hero` owned by the contributor. Pending or approved media may enter private recipe review, but publication requires approval.

### Requested-change revisions

The owner-only revision editor restores the current attached image only when it is uploaded and pending or approved. Rejected, quarantined, deleted, or unavailable media must be replaced.

The resubmission transaction validates that the replacement belongs to the contributor and is not assigned to another recipe. Recipe, media reference, normalized content, and immutable snapshots are committed in one guarded D1 batch.

### Publication

Recipe publication requires:

```text
upload_status = uploaded
moderation_status = approved
```

The final conditional recipe update checks this state again to prevent a concurrent media transition from publishing stale content.

## Activation order

Do not enable uploads merely because authentication is available.

1. Provision D1 and apply all authoritative migrations through `0007_recipe_revisions`.
2. Confirm R2 is bound.
3. Enable and test controlled authentication.
4. Provision contributor and editor/admin test accounts.
5. Confirm moderation staffing, retention, deletion, appeal, and escalation procedures.
6. Test valid uploads, invalid MIME/signatures, limits, reused/expired intents, owner previews, moderation, recipe attachment, replacement media, and anonymous denial of unapproved media.
7. Set `MEDIA_UPLOADS_ENABLED=true` only in the controlled deployment configuration.
8. Verify `/api/health` reports storage and upload readiness.
9. Enable recipe submissions separately only after the media matrix passes.

The repository default must remain false. Turning the flag off closes new intents/uploads while preserving existing stored data, editorial access, approved delivery, and published recipe references.

## Recommended next phase: privacy-safe derivatives

The next implementation phase should add transformed delivery while preserving the existing ownership and moderation model.

Required scope:

1. Keep originals private.
2. Normalize EXIF orientation.
3. Strip EXIF and unnecessary metadata.
4. Generate bounded responsive variants.
5. Prefer WebP and AVIF where runtime support and fallback behavior are verified.
6. Record derivative version, dimensions, format, checksum/ETag, source checksum, and generation status.
7. Serve public derivatives only when the parent D1 asset is uploaded and approved.
8. Keep contributor/editor private previews no-store.
9. Define regeneration when transformation policy changes.
10. Define cleanup when an original is deleted, rejected, quarantined, or replaced.
11. Add idempotency and race protection for generation.
12. Add health diagnostics, CI validator invariants, test matrix, rollback, and documentation.

Cloudflare Images or a controlled Worker transformation path may be used, but the implementation must not expose originals or bypass D1 approval.

## Current boundaries

- Uploading or approving an image does not publish a recipe.
- Detaching an asset does not silently delete its R2 original.
- Original-file metadata may still exist until the derivative phase is implemented.
- Automated malware/content scanning is not implemented.
- Public derivative URLs, responsive variant selection, regeneration, and derivative cleanup are not implemented.
- All production activation remains pending.
