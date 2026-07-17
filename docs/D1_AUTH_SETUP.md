# D1 Authentication and Trusted-Write Activation

The account, contributor-media, recipe-submission, editorial, and contributor-revision systems are implemented for a future D1 deployment. Every trusted write surface remains disabled in checked-in configuration, and the current D1-free public deployment is unchanged.

Read [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md) before continuing engineering work or changing activation procedures.

## Architecture

| Concern | Storage or control |
| --- | --- |
| User identities, password hashes, and account status | Cloudflare D1 |
| Verification/reset token digests | Cloudflare D1 |
| Consent and authentication audit history | Cloudflare D1 |
| Sessions, CSRF, and rate-limit state | Workers KV |
| Contributor image originals | Cloudflare R2 |
| Media ownership, intents, moderation, and checksums | Cloudflare D1 |
| Recipe rows and normalized relations | Cloudflare D1 |
| Editorial events and immutable revision snapshots | Cloudflare D1 |
| Bot challenge | Cloudflare Turnstile |
| Verification email delivery | Authenticated HTTPS webhook |
| Password hashing | PBKDF2-HMAC-SHA256, 600,000 iterations, unique salt, server-only pepper |

A pending or unverified account cannot create a session. D1 is the source of truth for account status and `auth_version`; deleting a KV session or incrementing `auth_version` revokes access.

Media uploads and recipe submissions/revisions have independent activation flags and do not open merely because sign-in is enabled.

## Fail-closed checked-in values

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false",
"MEDIA_UPLOADS_ENABLED": "false",
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

Disabling `RECIPE_SUBMISSIONS_ENABLED` closes first submissions, requested changes, resubmissions, publication, and archival write transitions while preserving stored rows, snapshots, audit history, approved media delivery, and published recipe reads.

## Authoritative migrations

Wrangler applies only the nested sequence:

```text
migrations/d1/0001_initial/migration.sql
migrations/d1/0002_seed/migration.sql
migrations/d1/0003_market_coverage/migration.sql
migrations/d1/0004_auth_accounts/migration.sql
migrations/d1/0005_media_pipeline/migration.sql
migrations/d1/0006_recipe_editorial/migration.sql
migrations/d1/0007_recipe_revisions/migration.sql
migrations/d1/0008_media_derivatives/migration.sql
```

`wrangler.d1.jsonc` uses:

```jsonc
"migrations_pattern": "migrations/d1/*/migration.sql"
```

Migration responsibilities:

- `0004_auth_accounts` — identities, account state, password fields, token digests, consent, OAuth extension, and authentication audit schema
- `0005_media_pipeline` — upload intents, lifecycle/moderation fields, checksums, storage ETags, moderation events, and status-transition trigger
- `0006_recipe_editorial` — recipe-media ownership, optimistic lock revision, editorial timestamps/reasons, editorial events, and transition triggers
- `0007_recipe_revisions` — content revision, change-request/resubmission timestamps, unique guarded write token, and immutable revision snapshots
- `0008_media_derivatives` — source orientation/normalized dimensions, derivative jobs/variants, generation leases, output checksums/ETags, regeneration, and cleanup triggers

Root-level SQL files are legacy references and are not part of Wrangler's execution path.

## Production activation order

Do not enable trusted writes before schema, KV, R2, Turnstile, peppers, email delivery where needed, legal approval, operational accounts, moderation procedures, and rollback tests are verified in a non-production environment.

### 1. Provision and migrate D1

Run **Enable D1 and Deploy** with exact confirmation:

```text
ENABLE_D1
```

After completion, `/api/health` must report D1 mode and the expected D1/KV/R2 bindings. Authentication, registration, media uploads, and recipe submissions must remain disabled.

### 2. Configure the GitHub `production` environment

Required secrets:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
AUTH_PASSWORD_PEPPER
AUTH_FINGERPRINT_PEPPER
TURNSTILE_SECRET_KEY
```

Required variable:

```text
TURNSTILE_SITE_KEY
```

Public registration additionally requires:

```text
AUTH_EMAIL_WEBHOOK_TOKEN
AUTH_EMAIL_WEBHOOK_URL
AUTH_FROM_EMAIL                 # optional
```

Generate independent high-entropy password and fingerprint peppers. Do not reuse deployment credentials, database identifiers, session values, or webhook credentials.

Changing `AUTH_PASSWORD_PEPPER` invalidates existing password hashes. Rotating `AUTH_FINGERPRINT_PEPPER` breaks correlation with older audit fingerprints but does not invalidate passwords or sessions.

### 3. Configure Turnstile

- Create a widget for the final production and intentional staging hostnames.
- Store the site key as `TURNSTILE_SITE_KEY`.
- Store the secret as `TURNSTILE_SECRET_KEY`.
- Restrict the widget to approved hostnames.

The Worker calls Cloudflare Siteverify and verifies the expected action and hostname. A browser widget result is never trusted by itself.

### 4. Configure verification email delivery

When registration is enabled, the Worker sends an authenticated JSON request to the configured HTTPS webhook. The adapter must return 2xx only after accepting the message and must not log complete verification links.

Verification tokens are single-use, expire after 30 minutes, and are stored only as SHA-256 digests. Failed delivery invalidates the token and rolls back the new pending registration.

### 5. Enable sign-in with optional writes closed

Open **Actions → Enable Authentication**, enter:

```text
ENABLE_AUTH
```

Keep these inputs false:

```text
enable_registration
enable_media_uploads
enable_recipe_submissions
```

The workflow:

1. Verifies required values without printing their contents.
2. Installs locked dependencies.
3. Runs project and operational validation.
4. Builds the D1 Worker.
5. Deploys checked-in fail-closed configuration.
6. Applies pending migrations.
7. Generates runner-only config and secret files.
8. Deploys sign-in with optional flags from workflow inputs.
9. Verifies deployed health.
10. Removes temporary files even after failure.

This permits controlled verified accounts to sign in while registration, uploads, submissions, and revisions remain closed.

### 6. Enable contributor media separately

Before enabling uploads:

1. Confirm migrations through `0008_media_derivatives` are applied and private R2 plus the `IMAGES` binding are ready.
2. Provision controlled contributor and editor/admin accounts.
3. Complete the synthetic orientation, metadata, format fallback, race, cache, cleanup, and rollback matrix in [`MEDIA_DERIVATIVE_TEST_MATRIX.md`](MEDIA_DERIVATIVE_TEST_MATRIX.md).
4. Confirm `/api/health` reports the current derivative policy, mandatory JPEG/WebP matrix, private-original denial, metadata verification, leases, regeneration, and cleanup capabilities.
5. Approve retention, deletion, appeal, escalation, and moderation procedures.
6. Review [`MEDIA_PIPELINE.md`](MEDIA_PIPELINE.md) and [`MEDIA_DERIVATIVE_ROLLBACK.md`](MEDIA_DERIVATIVE_ROLLBACK.md).

Run **Enable Authentication** with `enable_media_uploads=true`. Registration and recipe submissions may remain false.

### 7. Enable recipe submissions and revisions after media testing

Before activation:

1. Confirm migrations through `0008_media_derivatives` are applied.
2. Keep `enable_media_uploads=true`.
3. Provision controlled contributor and editor/admin accounts.
4. Complete the initial submission, editorial, revision, publication, and rollback tests below.
5. Review [`RECIPE_EDITORIAL.md`](RECIPE_EDITORIAL.md).

Run **Enable Authentication** with:

```text
enable_media_uploads=true
enable_recipe_submissions=true
```

The workflow rejects recipe activation without media uploads. It verifies:

- `recipeSubmissions.enabled=true`
- `recipeSubmissions.ready=true`
- approved media is required for publication
- optimistic locking capability
- requested-change capability
- contributor-revision capability
- immutable-snapshot capability

### 8. Enable public registration separately and last

Before registration:

1. Approve Terms and Privacy for the operating business and jurisdictions.
2. Verify the email adapter and sender domain.
3. Confirm Turnstile hostname restrictions.
4. Test registration, delivery, verification, login, lockout, logout, and revocation outside production.
5. Confirm webhook token and URL in the GitHub production environment.

Run **Enable Authentication** with `enable_registration=true`. Media and recipe flags remain independent except that recipe submissions require media uploads.

## Security behavior

- Production sessions use an HTTP-only, Secure, SameSite cookie with the `__Host-` prefix.
- CSRF tokens are signed, purpose-bound, and time-limited.
- Login, registration, media intents, first submissions, and resubmissions are rate-limited where applicable.
- Five failed password checks lock an active account for 15 minutes.
- Public login failures remain generic.
- Only verified active accounts can create or restore sessions.
- Authentication audit events store peppered fingerprints instead of raw IP addresses or complete user-agent strings.
- Password, verification, session, webhook, and deployment secrets are never committed.
- Media intents are one-time and store only token digests.
- Anonymous media delivery requires uploaded and approved D1 state.
- First submission revalidates categories, ownership, media purpose/state, and asset uniqueness.
- Requested changes require editor/admin role, expected lock revision, and a detailed reason.
- Resubmission requires recipe ownership, `draft` status, expected lock revision, purpose-bound `recipe-resubmit` CSRF, rate limiting, canonical validation, and eligible owned media.
- A temporary unique write token guards every relational delete/insert in the resubmission batch.
- Publication requires editor/admin role, expected lock revision, complete relational content, and approved media checked again inside the final D1 update.
- Public recipe queries remain restricted to `published`.

## Health checks

After sign-in activation with optional features closed, `/api/health` should include the equivalent of:

```json
{
  "dataMode": "d1",
  "authentication": {
    "enabled": true,
    "ready": true,
    "registrationEnabled": false
  },
  "media": {
    "uploadsEnabled": false,
    "storageReady": true,
    "ready": false
  },
  "recipeSubmissions": {
    "enabled": false,
    "ready": false,
    "publicationRequiresApprovedMedia": true,
    "optimisticLocking": true,
    "requestedChanges": true,
    "contributorRevisions": true,
    "immutableSnapshots": true
  }
}
```

When registration is enabled, both registration flags must be ready. When media is enabled, upload and storage readiness must be true. When recipe submissions are enabled, every recipe capability listed above must also be true.

Health output exposes readiness booleans, limits, and counts only. It does not expose secrets, R2 keys, bucket identifiers, private draft JSON, or revision snapshot contents.

## Recipe activation test matrix

1. Anonymous first submission and resubmission return 401.
2. Invalid origin, signed CSRF, or session CSRF returns 403.
3. Invalid drafts or unknown categories create no partial rows.
4. Another contributor's recipe or media cannot be used.
5. Rejected, quarantined, deleted, or reused media cannot be attached.
6. A valid first submission enters private `review` and remains absent from public search.
7. Publication remains blocked while media is pending.
8. Request changes without a detailed reason returns 422.
9. A valid request creates `review → draft` and one editorial event.
10. Only the owning contributor can open the revision editor.
11. A stale resubmission revision returns 409 and leaves normalized rows unchanged.
12. Successful resubmission writes baseline/revised snapshots, increments `content_revision`, and returns to `review`.
13. Approved media and complete content allow publication.
14. Concurrent media/revision changes return 409 instead of publishing stale content.
15. Archive without a clear reason returns 422.
16. Disabling recipe submissions closes first submission, request changes, resubmission, publication, and archive writes without deleting stored data.

## Rollback

Running **Enable D1 and Deploy** redeploys checked-in false values:

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false",
"MEDIA_UPLOADS_ENABLED": "false",
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

Existing sessions become unusable. New media, first-submission, requested-change, resubmission, publication, and archival writes close immediately.

Existing approved media and published recipes remain publicly readable through approval/status-gated routes. Pending private data, normalized recipe rows, revision snapshots, and audit history remain stored.

To close only recipe submissions and revisions, rerun **Enable Authentication** with `enable_recipe_submissions=false`. To revoke all sessions for one account, increment its `auth_version` through a controlled administrative action.
