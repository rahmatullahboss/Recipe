# D1 Authentication Activation

The account and contributor-media systems are implemented for the future D1 deployment, but sign-in, registration, and media uploads remain disabled by default. The current D1-free production path is unchanged.

## Architecture

| Concern | Storage or control |
| --- | --- |
| User identities, password hashes, account status | Cloudflare D1 |
| Email verification and reset token digests | Cloudflare D1 |
| Consent history and authentication audit events | Cloudflare D1 |
| Login sessions, CSRF and rate-limit state | Workers KV |
| Contributor image originals | Cloudflare R2 |
| Media ownership, intents, moderation, and checksums | Cloudflare D1 |
| Bot challenge | Cloudflare Turnstile |
| Verification email delivery | Authenticated HTTPS webhook |
| Password hashing | PBKDF2-HMAC-SHA256, 600,000 iterations, unique salt, server-only pepper |

A pending or unverified account cannot create a session. D1 is the source of truth for account status and `auth_version`; deleting a KV session or incrementing `auth_version` revokes access. Contributor media has a separate activation flag and remains unavailable merely because sign-in is enabled.

## Authoritative migrations

Wrangler applies only this nested sequence:

```text
migrations/d1/0001_initial/migration.sql
migrations/d1/0002_seed/migration.sql
migrations/d1/0003_market_coverage/migration.sql
migrations/d1/0004_auth_accounts/migration.sql
migrations/d1/0005_media_pipeline/migration.sql
```

`wrangler.d1.jsonc` uses:

```jsonc
"migrations_pattern": "migrations/d1/*/migration.sql"
```

Root-level SQL files are retained as legacy development references and are not part of the Wrangler execution path.

## Production activation order

Do not enable trusted-write flags before the schema, KV, R2, Turnstile, peppers, optional registration email delivery, and moderation procedures are verified.

### 1. Provision and migrate D1

Run **Enable D1 and Deploy** with the exact confirmation value:

```text
ENABLE_D1
```

After completion, `/api/health` must report D1 mode and available D1/KV/R2 bindings. Authentication and media uploads should still report disabled.

### 2. Configure the GitHub `production` environment

The guarded **Enable Authentication** workflow reads deployment credentials plus authentication configuration from the `production` environment.

Required environment secrets for sign-in:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
AUTH_PASSWORD_PEPPER
AUTH_FINGERPRINT_PEPPER
TURNSTILE_SECRET_KEY
```

Required environment variable for sign-in:

```text
TURNSTILE_SITE_KEY
```

Public registration additionally requires:

```text
AUTH_EMAIL_WEBHOOK_TOKEN        # environment secret
AUTH_EMAIL_WEBHOOK_URL          # environment variable
AUTH_FROM_EMAIL                 # optional environment variable
```

Generate independent high-entropy values for the password and fingerprint peppers. Do not reuse deployment credentials, database identifiers, or session values.

Changing `AUTH_PASSWORD_PEPPER` invalidates existing password hashes. Keep it in a managed secret store with a documented recovery process. Rotating `AUTH_FINGERPRINT_PEPPER` breaks correlation with older audit fingerprints but does not invalidate passwords or sessions.

### 3. Configure Turnstile

Create a Turnstile widget for the final production hostname and any intentional staging hostname.

- Store the public site key as `TURNSTILE_SITE_KEY`.
- Store the secret key as `TURNSTILE_SECRET_KEY`.
- Restrict the widget to approved hostnames.

The Worker always calls Cloudflare Siteverify and checks the expected action and hostname. A browser widget result is never trusted by itself.

### 4. Configure verification email delivery

When registration is enabled, the Worker sends an authenticated JSON request to the configured HTTPS webhook. The request contains:

```json
{
  "event": "verify_email",
  "to": "member@example.com",
  "from": "accounts@example.com",
  "recipientName": "Member Name",
  "verificationUrl": "https://example.com/verify-email?token=...",
  "expiresAt": "2026-07-17T12:30:00.000Z"
}
```

The adapter must authenticate the request using the configured webhook token, return 2xx only after accepting the message for delivery, and avoid logging the complete verification link.

Verification tokens are single-use, expire after 30 minutes, and are stored only as SHA-256 digests in D1. A failed delivery invalidates the token and removes the newly created pending registration.

### 5. Enable sign-in with registration and media closed

Open **Actions → Enable Authentication** and enter exactly:

```text
ENABLE_AUTH
```

Keep both `enable_registration` and `enable_media_uploads` set to false.

The workflow:

1. Verifies required values without printing their contents.
2. Validates the project and builds the D1 Worker.
3. Deploys the checked-in D1 configuration with accounts and uploads disabled.
4. Applies pending migrations.
5. Generates runner-only config and secret input files.
6. Deploys with `AUTH_ENABLED=true`, `AUTH_REGISTRATION_ENABLED=false`, and `MEDIA_UPLOADS_ENABLED=false`.
7. Verifies account and media readiness through `/api/health`.
8. Removes temporary files even after failure.

This allows verified active accounts to sign in while public registration and contributor uploads remain closed. The seeded editorial record has no usable password; operational accounts still require a controlled provisioning process.

### 6. Enable contributor media separately

Before enabling uploads:

1. Provision verified contributor and editor or administrator accounts.
2. Confirm migration `0005_media_pipeline` is applied and R2 is bound.
3. Test valid and invalid JPEG, PNG, and WebP files, size limits, one-time intent reuse, pending owner previews, moderation decisions, and anonymous denial of unapproved media.
4. Approve moderation response, retention, deletion, and escalation procedures.
5. Review `docs/MEDIA_PIPELINE.md`, including the original-file metadata and derivative-generation boundary.

Run **Enable Authentication** again with `enable_media_uploads` set to true. Registration may remain false. The workflow verifies that the media flag matches the input, storage is ready, and the complete media readiness result is true.

### 7. Enable public registration last

Before opening registration:

1. Approve the Terms of Use and Privacy Notice for the operating business and jurisdictions.
2. Verify the email adapter and sender domain.
3. Confirm Turnstile hostname restrictions.
4. Test registration, email delivery, verification, login, lockout, logout, and session revocation outside production.
5. Confirm the webhook token and URL are present in the GitHub `production` environment.

Run **Enable Authentication** again with `enable_registration` set to true. Choose the media flag independently. The workflow refuses to proceed if registration-specific delivery configuration is missing and verifies `registrationReady: true` after deployment.

## Security behavior

- Production sessions use an HTTP-only, Secure, SameSite cookie with the `__Host-` prefix.
- CSRF tokens are purpose-bound, signed, and time-limited.
- Login and registration have KV-backed rate limits.
- Five failed password checks lock an active account for 15 minutes.
- Public login errors remain generic to reduce account enumeration.
- Only verified `active` accounts can create or restore sessions.
- Audit records store separate peppered IP and user-agent fingerprints rather than raw values.
- Registration, login, email verification, and logout outcomes are audited.
- Password, verification, session, email, and deployment secrets are never committed.
- Registration records the accepted terms and privacy document version.
- Media intents are one-time and store only token digests.
- Anonymous media delivery requires an uploaded and approved D1 asset record.

## Health checks

After sign-in activation with registration and media closed, `/api/health` must report:

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
  }
}
```

When registration is enabled, `registrationEnabled` and `registrationReady` must both be true. When contributor media is enabled, `uploadsEnabled`, `storageReady`, and `ready` must all be true.

Health output exposes only readiness booleans, limits, and counts; it never returns secret values, object keys, or bucket identifiers.

## Rollback

To disable account access and new media uploads without deleting D1 or R2 data, run **Enable D1 and Deploy** again. The checked-in D1 configuration redeploys:

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false",
"MEDIA_UPLOADS_ENABLED": "false"
```

Existing KV session records become unusable because middleware refuses to restore authentication context while the feature is disabled. New upload intents and raw upload requests close immediately. Existing approved media remains available through the approval-gated delivery route; pending and moderated private assets remain inaccessible to anonymous visitors.

To revoke every session for one account, increment that user's `auth_version` through a controlled administrative action. The next request invalidates KV sessions carrying the previous version.
