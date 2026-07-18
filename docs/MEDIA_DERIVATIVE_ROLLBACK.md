# Privacy-safe media derivative rollback

This runbook assumes the four checked-in feature flags remain `false` until a separate, reviewed activation. It does not authorize deployment, D1 activation, account provisioning, real uploads or moderation.

## Safety model

Migration `0008_media_derivatives` is additive. It does not rewrite or expose original R2 objects. Public delivery is denied unless the parent asset is uploaded and approved and a complete current-policy derivative job is ready. Therefore, the safest incident response is to disable entry points and preserve database evidence before deleting anything.

## Immediate containment

1. Set runtime `MEDIA_UPLOADS_ENABLED=false` and `RECIPE_SUBMISSIONS_ENABLED=false` in the deployment configuration used by the guarded workflow. Do not change the checked-in defaults.
2. If public derivative delivery itself is suspected, roll the Worker code back to the last known-good commit while keeping the R2 bucket private.
3. Do not make the R2 bucket public and do not add an original-object fallback.
4. Confirm `/api/health` reports media uploads disabled and inspect logs for checksum, ETag, metadata, transform or cleanup failures.
5. Preserve `media_assets`, `media_derivative_jobs`, `media_derivatives` and moderation event rows for incident review.

## Code rollback before migration activation

When migration `0008` has not been applied remotely, revert the derivative code and documentation commit normally. No database or R2 work is required. The branch must still pass the existing build and validator before any later deployment.

## Code rollback after migration activation

Migration `0008` may remain in place because its tables and columns are additive. Deploying an older Worker that does not reference them is safer than attempting a destructive down migration during an incident.

Required checks:

- originals remain in a private R2 bucket;
- no public route fetches `media_assets.r2_key` directly;
- media and recipe feature flags remain disabled until the replacement Worker is verified;
- no approved recipe is published with an unavailable image URL;
- cleanup jobs are not run destructively until object ownership and recipe references are confirmed.

## Policy rollback or regeneration

If `recipe-images-v1` is defective but D1/R2 integrity is intact:

1. Introduce a new immutable policy version; never silently change transform semantics under the same version.
2. Mark affected jobs pending and generate the new deterministic namespace.
3. Keep public delivery on the old ready policy until the new mandatory JPEG/WebP matrix is verified, or disable public derivative delivery if the old policy is unsafe.
4. Switch the code’s policy version only after generated checksums, dimensions and metadata scans pass.
5. Delete old policy objects only after the new job is ready and public delivery has been verified.

## Source checksum or ETag incident

For a mismatch:

1. Treat D1 and R2 as inconsistent; deny approval and delivery.
2. Do not update D1 checksum/ETag merely to silence the error.
3. Verify the original object was not replaced outside the upload transaction.
4. If the original is trusted, create a new immutable media asset through the normal upload path and replace the recipe reference atomically.
5. Detach and delete the old asset only after no recipe references it; cleanup then removes derivatives and the private original.

## Metadata leakage incident

1. Disable public derivative delivery or roll back the Worker immediately.
2. Mark the parent asset quarantined, which denies delivery before cleanup completes.
3. Delete every derivative object for the affected media ID and policy/checksum namespace.
4. Keep the original private for incident analysis unless deletion is legally or operationally required.
5. Increment the policy version, strengthen output scanners, regenerate from synthetic fixtures, and rerun the complete test matrix before reactivation.
6. Purge any external CDN caches by canonical derivative URL if a deployed environment used additional caching outside this Worker/R2 design.

## Cleanup recovery

Cleanup is deliberately fail-closed: moderation/deletion state denies delivery in D1 before object deletion. If R2 deletion fails:

- leave the asset rejected, quarantined or deleted;
- retry guarded cleanup using the media ID;
- compare remaining `media_derivatives.r2_key` rows with R2 objects;
- delete only keys rooted under `derivatives/{media_id}/` that match D1 ownership;
- delete the private original only when `upload_status='deleted'`, no recipe references the asset, and the delete request was authorized;
- record the recovery outcome in operational logs or an incident ticket.

## Destructive database rollback

Dropping `media_derivatives`, `media_derivative_jobs` or the added `media_assets` columns is not part of the normal rollback. SQLite/D1 column removal requires a table rebuild and can destroy evidence. A destructive rollback needs a separate reviewed migration, remote backup/export, maintenance window and verified restoration test.

## Recovery verification

Before re-enabling any capability:

```bash
npm ci
npm run validate
npm run build
npm run build:d1
```

Then verify the guarded deployment health assertions, synthetic orientation/metadata fixtures, approval gate, private previews, public fallback negotiation, ETag/checksum behavior, race retries and cleanup matrix. Re-enable one capability at a time: authentication, then media uploads, then recipe submissions. Public registration remains a separate decision.
