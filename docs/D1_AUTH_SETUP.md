# D1 Authentication Activation

The account, contributor-media, and recipe-editorial systems are implemented for the future D1 deployment, but every trusted write surface remains disabled by default. The current D1-free production path is unchanged.

## Architecture

| Concern | Storage or control |
| --- | --- |
| User identities, password hashes, account status | Cloudflare D1 |
| Email verification and reset token digests | Cloudflare D1 |
| Consent history and authentication audit events | Cloudflare D1 |
| Login sessions, CSRF and rate-limit state | Workers KV |
| Contributor image originals | Cloudflare R2 |
| Media ownership, intents, moderation, and checksums | Cloudflare D1 |
| Recipe submissions, relations, revisions, and editorial events | Cloudflare D1 |
| Bot challenge | Cloudflare Turnstile |
| Verification email delivery | Authenticated HTTPS webhook |
| Password hashing | PBKDF2-HMAC-SHA256, 600,000 iterations, unique salt, server-only pepper |

A pending or unverified account cannot create a session. D1 is the source of truth for account status and `auth_version`; deleting a KV session or incrementing `auth_version` revokes access. Media uploads and recipe submissions each have separate activation flags and do not open merely because sign-in is enabled.

## Authoritative migrations

Wrangler applies only this nested sequence:

```text
migrations/d1/0001_initial/migration.sql
migrations/d1/0002_seed/migration.sql
migrations/d1/0003_market_coverage/migration.sql
migrations/d1/0004_auth_accounts/migration.sql
migrations/d1/0005_media_pipeline/migration.sql
migrations/d1/0006_recipe_editorial/migration.sql
```

`wrangler.d1.jsonc` uses:

```jsonc
"migrations_pattern": "migrations/d1/*/migration.sql"
```

Root-level SQL files are retained as legacy references and are not part of the Wrangler execution path.

## Production activation order

Do not enable trusted-write flags before the schema, KV, R2, Turnstile, peppers, optional registration email delivery, contributor accounts, and editorial procedures are verified.

### 1. Provision and migrate D1

Run **Enable D1 and Deploy** with exact confirmation:

```text
ENABLE_D1
```

After completion, `/api/health` must report D1 mode and available D1/KV/R2 bindings. Authentication, media uploads, and recipe submissions should still report disabled.

### 2. Configure the GitHub `production` environment

Required environment secrets for sign-in:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
AUTH_PASSWORD_PEPPER
AUTH_FINGERPRINT_PEPPER
TURNSTILE_SECRET_KEY
```

Required environment variable:

```text
TURNSTILE_SITE_KEY
```

Public registration additionally requires:

```text
AUTH_EMAIL_WEBHOOK_TOKEN        # environment secret
AUTH_EMAIL_WEBHOOK_URL          # environment variable
AUTH_FROM_EMAIL                 # optional environment variable
```

Generate independent high-entropy password and fingerprint peppers. Do not reuse deployment credentials, database identifiers, or session values.

Changing `AUTH_PASSWORD_PEPPER` invalidates existing password hashes. Rotating `AUTH_FINGERPRINT_PEPPER` breaks correlation with older audit fingerprints but does not invalidate passwords or sessions.

### 3. Configure Turnstile

Create a widget for final production and intentional staging hostnames.

- Store the public site key as `TURNSTILE_SITE_KEY`.
- Store the secret key as `TURNSTILE_SECRET_KEY`.
- Restrict the widget to approved hostnames.

The Worker calls Cloudflare Siteverify and checks expected action and hostname. A browser widget result is never trusted by itself.

### 4. Configure verification email delivery

When registration is enabled, the Worker sends an authenticated JSON request to the configured HTTPS webhook. The adapter must return 2xx only after accepting the message and must avoid logging complete verification links.

Verification tokens are single-use, expire after 30 minutes, and are stored only as SHA-256 digests in D1. Failed delivery invalidates the token and removes the newly created pending registration.

### 5. Enable sign-in with every optional write surface closed

Open **Actions → Enable Authentication** and enter:

```text
ENABLE_AUTH
```

Keep `enable_registration`, `enable_media_uploads`, and `enable_recipe_submissions` false.

The workflow:

1. Verifies required values without printing contents.
2. Validates the project and builds the D1 Worker.
3. Deploys checked-in configuration with trusted writes disabled.
4. Applies pending migrations.
5. Generates runner-only config and secret input files.
6. Deploys with sign-in enabled and optional flags set from workflow inputs.
7. Verifies account, media, and recipe readiness through `/api/health`.
8. Removes temporary files even after failure.

This allows verified active accounts to sign in while registration, uploads, and recipe submissions remain closed. Operational accounts still require controlled provisioning.

### 6. Enable contributor media separately

Before enabling uploads:

1. Provision verified contributor and editor/admin accounts.
2. Confirm migration `0005_media_pipeline` is applied and R2 is bound.
3. Test valid and invalid raster files, limits, one-time intent reuse, pending previews, moderation, and anonymous denial of unapproved media.
4. Approve moderation, retention, deletion, and escalation procedures.
5. Review `docs/MEDIA_PIPELINE.md`.

Run **Enable Authentication** with `enable_media_uploads=true`. Registration and recipe submissions may remain false. The workflow verifies the flag, R2 storage, and complete media readiness.

### 7. Enable recipe submissions after media testing

Before enabling recipe submissions:

1. Confirm migrations through `0006_recipe_editorial` are applied.
2. Complete the media test matrix and keep `enable_media_uploads=true`.
3. Provision contributor and editor/admin accounts.
4. Test atomic submission, ownership denial, private review, pending-media publication blocking, approved publication, stale revisions, archive reasons, and event history.
5. Review `docs/RECIPE_EDITORIAL.md`.

Run **Enable Authentication** with both `enable_media_uploads=true` and `enable_recipe_submissions=true`. The workflow rejects recipe submissions without media uploads and verifies `recipeSubmissions.ready=true` after deployment.

### 8. Enable public registration separately and last

Before registration:

1. Approve Terms and Privacy for the operating business and jurisdictions.
2. Verify email adapter and sender domain.
3. Confirm Turnstile hostname restrictions.
4. Test registration, email delivery, verification, login, lockout, logout, and revocation outside production.
5. Confirm webhook token and URL in the GitHub production environment.

Run **Enable Authentication** with `enable_registration=true`. Media and recipe flags remain independent, except recipe submissions require media uploads.

## Security behavior

- Production sessions use an HTTP-only, Secure, SameSite cookie with the `__Host-` prefix.
- CSRF tokens are purpose-bound, signed, and time-limited.
- Login, registration, media intents, and recipe submissions are rate-limited where applicable.
- Five failed password checks lock an active account for 15 minutes.
- Public login errors remain generic to reduce enumeration.
- Only verified `active` accounts can create or restore sessions.
- Audit records store peppered fingerprints rather than raw IP or full user-agent values.
- Password, verification, session, email, and deployment secrets are never committed.
- Media intents are one-time and store only token digests.
- Anonymous media delivery requires an uploaded and approved D1 asset.
- Recipe submission revalidates categories, ownership, media purpose, media state, and asset uniqueness.
- Publication requires editor/admin role, optimistic revision, complete relational content, and approved media checked again inside the final D1 update.

## Health checks

After sign-in activation with optional features closed, `/api/health` should include:

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
    "publicationRequiresApprovedMedia": true
  }
}
```

When registration is enabled, both registration flags must be ready. When media is enabled, uploads and media readiness must be true. When recipe submissions are enabled, `recipeSubmissions.enabled` and `recipeSubmissions.ready` must both be true.

Health output exposes only readiness booleans, limits, and counts; it never returns secrets, object keys, or bucket identifiers.

## Rollback

Running **Enable D1 and Deploy** redeploys checked-in values:

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false",
"MEDIA_UPLOADS_ENABLED": "false",
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

Existing sessions become unusable. New media and recipe writes close immediately. Existing approved media and published recipes remain publicly readable through approval/status-gated read routes. Pending private data and audit history remain stored.

To close only recipe submissions, rerun **Enable Authentication** with `enable_recipe_submissions=false`. To revoke every session for one account, increment its `auth_version` through a controlled administrative action.
