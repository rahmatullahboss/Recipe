# Guarded R2 Media Pipeline

Contributor image upload code is implemented but disabled by default. The checked-in D1 configuration keeps `MEDIA_UPLOADS_ENABLED` set to `false`.

## Storage model

- Cloudflare D1 stores one-time upload-intent digests, expected file metadata, media ownership, checksums, dimensions, alternative text, lifecycle state, and moderation history.
- Cloudflare R2 stores the original raster image under a generated server-side key.
- The browser never selects an R2 key and never receives reusable storage credentials.
- The recipe draft stores only a media asset identifier. A future publishing transaction must re-check ownership and approval in D1.

## Accepted images

- JPEG
- PNG
- WebP
- Maximum 8 MB
- Minimum 320 by 240 pixels
- Maximum 12,000 pixels on either side and 40 megapixels overall

SVG and arbitrary binary uploads are not accepted. The Worker compares the declared MIME type with the file signature, reads dimensions, and stores a SHA-256 checksum of the original bytes.

## Upload sequence

1. A verified signed-in contributor requests an upload intent.
2. The request must pass same-origin, signed CSRF, current-session CSRF, rate-limit, file-type, size, filename, purpose, and alternative-text checks.
3. D1 stores only the intent token digest and an expiry time. The plaintext token is returned once to the same browser.
4. The browser sends the raw file body to the Worker with the one-time token.
5. The Worker verifies expected size and type, validates the raster signature and dimensions, and atomically consumes the intent.
6. The validated original is written privately to R2 and a pending media asset is written to D1.
7. A contributor may privately preview their own pending asset. It is not anonymously available.

## Moderation

The private queue is available at `/admin/media` only to verified editor or administrator accounts.

Editors can:

- approve an asset;
- reject an asset with a reason;
- quarantine an asset with a reason;
- return an asset to pending review.

Every accepted status transition records the moderator, previous state, next state, reason, and timestamp. Rejected or quarantined images remain unavailable to anonymous visitors.

## Delivery rules

- Anonymous requests receive only assets whose D1 state is `uploaded` and `approved`.
- Owners can preview only their own pending assets with an authenticated request.
- Editors and administrators can privately preview moderation assets.
- Private previews use `private, no-store` and vary by cookie.
- Approved assets use immutable public caching and retain an ETag.
- Responses use `nosniff` and same-site cross-origin resource policy headers.
- A guessed or leaked R2 key is insufficient without an approved D1 media record.

## Activation order

Do not enable uploads merely because authentication is available.

1. Provision D1 and apply migration `0005_media_pipeline`.
2. Confirm the R2 binding is available.
3. Enable and test authentication with verified editor and contributor accounts.
4. Confirm the moderation queue is staffed and operational procedures are approved.
5. Test JPEG, PNG, and WebP uploads; invalid MIME declarations; oversized files; reused and expired intents; owner previews; editor decisions; and anonymous denial of pending assets.
6. Set `MEDIA_UPLOADS_ENABLED` to `true` only in the controlled deployment configuration.
7. Verify `/api/health` reports media uploads enabled, storage ready, and media ready.

The repository default must remain `false`. Turning the flag back to `false` immediately closes new intent and upload requests while preserving existing approved delivery and editorial access.

## Current boundaries

- Uploading an image does not publish a recipe.
- Detaching an asset from a browser-local draft does not silently delete the R2 object.
- Media ownership and approval must be checked again when D1 recipe publishing is implemented.
- Automated image transformation, metadata stripping, derivative generation, and malware scanning are separate production hardening phases. Until those are connected, moderation procedures must account for original-file metadata and content risk.
