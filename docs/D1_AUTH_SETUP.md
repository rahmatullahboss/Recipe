# D1 Authentication Activation

The account system is implemented for the future D1 deployment, but both authentication flags remain disabled by default. The current D1-free production path is unchanged.

## Architecture

| Concern | Storage or control |
| --- | --- |
| User identities, password hashes, account status | Cloudflare D1 |
| Email verification and reset token digests | Cloudflare D1 |
| Consent history and authentication audit events | Cloudflare D1 |
| Login sessions, CSRF/rate-limit state | Workers KV |
| Bot challenge | Cloudflare Turnstile |
| Verification email delivery | Authenticated HTTPS webhook |
| Password hashing | PBKDF2-HMAC-SHA256, 600,000 iterations, unique salt, server-only pepper |

A pending or unverified account cannot create a session. D1 is the source of truth for account status and `auth_version`; deleting a KV session or incrementing `auth_version` revokes access.

## Authoritative migrations

Wrangler applies only this nested sequence:

```text
migrations/d1/0001_initial/migration.sql
migrations/d1/0002_seed/migration.sql
migrations/d1/0003_market_coverage/migration.sql
migrations/d1/0004_auth_accounts/migration.sql
```

`wrangler.d1.jsonc` uses:

```jsonc
"migrations_pattern": "migrations/d1/*/migration.sql"
```

Root-level SQL files are retained as legacy development references and are not part of the Wrangler execution path.

## Production activation order

Do not enable account flags before the schema, KV, Turnstile, email webhook, and secrets are verified.

### 1. Provision and migrate D1

Run the guarded **Enable D1 and Deploy** workflow with the exact confirmation value:

```text
ENABLE_D1
```

After it completes, `/api/health` must report `dataMode: "d1"` and the D1/KV bindings as available. Authentication should still report `enabled: false`.

### 2. Configure Turnstile

Create a Turnstile widget for the final production hostname. Store the public site key as a Worker variable and the secret key as a Worker secret.

Future `wrangler.d1.jsonc` variables:

```jsonc
"TURNSTILE_SITE_KEY": "<public-site-key>"
```

Secret command:

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY --config wrangler.d1.jsonc
```

Turnstile tokens are verified server-side with Cloudflare Siteverify. The expected action and production hostname are checked. Tokens are not accepted based only on the browser widget.

### 3. Configure password and audit peppers

Generate two independent high-entropy values. Do not reuse the API token, session token, or database identifiers.

```bash
npx wrangler secret put AUTH_PASSWORD_PEPPER --config wrangler.d1.jsonc
npx wrangler secret put AUTH_FINGERPRINT_PEPPER --config wrangler.d1.jsonc
```

Changing `AUTH_PASSWORD_PEPPER` invalidates existing password hashes. Keep it in a managed secret store with a documented recovery process. `AUTH_FINGERPRINT_PEPPER` may be rotated, but audit fingerprints created before and after rotation will no longer correlate.

### 4. Configure verification email delivery

The Worker sends an authenticated JSON request to an HTTPS webhook. Store the endpoint and bearer token as Worker secrets:

```bash
npx wrangler secret put AUTH_EMAIL_WEBHOOK_URL --config wrangler.d1.jsonc
npx wrangler secret put AUTH_EMAIL_WEBHOOK_TOKEN --config wrangler.d1.jsonc
```

Add the sender as a non-secret variable after the sending domain is verified:

```jsonc
"AUTH_FROM_EMAIL": "accounts@example.com"
```

Webhook request format:

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

Required request headers:

```text
Authorization: Bearer <AUTH_EMAIL_WEBHOOK_TOKEN>
Content-Type: application/json
```

The webhook must return a successful 2xx response only after accepting the message for delivery. A failed response invalidates the D1 token and rolls back a newly created pending registration.

Verification tokens are single-use, expire after 30 minutes, and are stored only as SHA-256 digests in D1.

### 5. Enable sign-in only

After D1, KV, Turnstile, and peppers are verified, change:

```jsonc
"AUTH_ENABLED": "true",
"AUTH_REGISTRATION_ENABLED": "false"
```

Deploy the D1 configuration. This allows verified active accounts to sign in but keeps public registration closed.

A seeded editorial record has no usable password by default. Provision operational admin/editor credentials through a controlled one-time administration process before relying on sign-in.

### 6. Enable registration last

Before public registration:

1. Have the Terms of Use and Privacy Notice approved for the operating business and jurisdiction.
2. Verify the email webhook and sender domain.
3. Confirm Turnstile hostname restrictions.
4. Confirm `/api/health` reports `registrationReady: true` after the flag is enabled.
5. Test registration, email verification, login, five-attempt lockout, logout, and session revocation in a non-production environment.

Then change:

```jsonc
"AUTH_REGISTRATION_ENABLED": "true"
```

and deploy the D1 configuration.

## Required bindings and values

Core sign-in requires:

```text
DB
SESSION
AUTH_ENABLED=true
AUTH_PASSWORD_PEPPER
AUTH_FINGERPRINT_PEPPER
TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY
```

Registration additionally requires:

```text
AUTH_REGISTRATION_ENABLED=true
AUTH_EMAIL_WEBHOOK_URL
AUTH_EMAIL_WEBHOOK_TOKEN
```

Optional:

```text
AUTH_FROM_EMAIL
```

## Security behavior

- Production session cookie uses the `__Host-` prefix, HTTP-only, Secure, SameSite, and path `/`.
- CSRF tokens are purpose-bound, signed, and time-limited.
- Login and registration have KV-backed rate limits.
- Five failed password checks lock an account for 15 minutes.
- Public login errors remain generic to reduce account enumeration.
- Only verified `active` accounts can create or restore sessions.
- Audit records use peppered IP and user-agent fingerprints rather than raw values.
- Password, verification, and session secrets are never committed to the repository.

## Rollback

To stop account access without affecting public recipes:

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false"
```

Redeploy `wrangler.d1.jsonc`. Existing KV session records remain unusable because middleware refuses to load authentication context while the feature flag is disabled.

To revoke all sessions for one account, increment that user's `auth_version` in D1 through a controlled administrative action. The next request invalidates every KV session carrying the previous version.
