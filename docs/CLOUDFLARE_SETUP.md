# Cloudflare and GitHub CI/CD Setup

The project currently deploys without D1. The international static catalogue and browser-local kitchen tools remain operational while the future D1 database and account system stay disabled.

## 1. Enable the Cloudflare services

In the target Cloudflare account, confirm:

1. Workers & Pages is enabled and a `workers.dev` subdomain is registered.
2. R2 is activated.
3. Cloudflare Images is available if runtime transformations will be used.
4. A domain is active in Cloudflare only when a custom production hostname will be connected.

Wrangler can provision the draft `SESSION` KV namespace, `MEDIA` R2 bucket, and `IMAGES` binding during the initial D1-free deployment.

## 2. Create the deployment API token

Open **My Profile → API Tokens → Create Token**, start from **Edit Cloudflare Workers**, restrict it to the target account, and keep these permissions.

### Required now

- Account → Workers Scripts → Edit
- Account → Workers KV Storage → Edit
- Account → Workers R2 Storage → Edit
- Account → Account Settings → Read
- User → User Details → Read
- User → Memberships → Read

### Required for a custom domain

- Zone → Workers Routes → Edit for the selected zone

### Required for Cloudflare Images management

- Account → Cloudflare Images → Edit

### Required later for D1

- Account → D1 → Edit

Never commit the token or place it in a tracked environment file.

## 3. Find the Account ID

Copy the **Account ID** from the target Cloudflare account dashboard or a zone overview.

## 4. Configure GitHub deployment secrets

Create a GitHub environment named `production` and add:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

Recommended protection:

- Restrict deployment branches to `main`.
- Require approval for production deployments where appropriate.
- Prevent protection-rule bypass for stricter release control.

## 5. Enable GitHub Actions

Under **Settings → Actions → General**, allow repository Actions and verified creator actions. Workflow permissions need read access to repository contents. The workflows request their own minimal additional permissions.

## 6. Current automatic D1-free deployment

`.github/workflows/deploy.yml` runs after changes reach `main`:

```bash
npm ci
npm run build
wrangler deploy --config wrangler.jsonc
```

`wrangler.jsonc` has no D1 binding. The application uses `src/data/fallback-recipes.ts` and keeps authentication unavailable.

After deployment, `/api/health` should include:

```json
{
  "ok": true,
  "runtime": "cloudflare-workers",
  "dataMode": "static-fallback"
}
```

The workflow also checks ten supported markets plus KV, R2, and Images binding readiness.

## 7. Connect a custom domain

After the Worker deploys:

1. Open **Workers & Pages → ozzyl-recipes → Settings → Domains & Routes**.
2. Add the final production hostname.
3. Keep Wrangler configuration as the deployment source of truth.
4. Re-run deployment after DNS and certificate status become active.

## 8. Enable D1 later

Do not run this while the account is at its D1 limit.

When D1 becomes available:

1. Add **D1 Edit** to the deployment API token.
2. Open **GitHub → Actions → Enable D1 and Deploy**.
3. Run it with the exact confirmation value:

```text
ENABLE_D1
```

The workflow performs:

```bash
npm ci
npm run build:d1
wrangler deploy --config wrangler.d1.jsonc
wrangler d1 migrations apply DB --remote --config wrangler.d1.jsonc
wrangler deploy --config wrangler.d1.jsonc
```

The first deployment provisions the draft D1 binding. Public recipe queries retain static fallback protection until migrations finish.

### Authoritative migration layout

Wrangler applies only:

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

Root-level SQL files are legacy development references and are outside the Wrangler migration execution path.

After migration, `/api/health` should report:

```json
{
  "dataMode": "d1",
  "authentication": {
    "enabled": false,
    "registrationEnabled": false
  }
}
```

D1 data can therefore run while accounts remain closed.

## 9. Enable D1 authentication separately

Authentication is intentionally controlled by two independent flags in `wrangler.d1.jsonc`:

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false"
```

Do not enable either flag merely because D1 migrations succeeded.

Core sign-in later requires Worker bindings/secrets for:

```text
DB
SESSION
AUTH_PASSWORD_PEPPER
AUTH_FINGERPRINT_PEPPER
TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY
```

Public registration additionally requires:

```text
AUTH_EMAIL_WEBHOOK_URL
AUTH_EMAIL_WEBHOOK_TOKEN
AUTH_REGISTRATION_ENABLED=true
```

The sender address may be configured as `AUTH_FROM_EMAIL` after its domain is verified.

Follow [D1 Authentication Activation](./D1_AUTH_SETUP.md) for the exact order, webhook contract, security behavior, testing, and rollback procedure. Do not place any password pepper, Turnstile secret, or webhook bearer token in this repository.

## 10. Rollback strategy

- Worker deployments can be rolled back from Cloudflare deployment history.
- D1 creates a backup before migrations.
- A failed migration rolls back while earlier successful migrations remain applied.
- Public D1 query failures fall back to the versioned catalogue.
- `wrangler.jsonc` can redeploy the D1-free application.
- Setting both auth flags to `false` disables account access without taking recipe discovery offline.

## 11. Production verification

Before considering D1 authentication ready:

1. Confirm all nested migrations are applied.
2. Confirm `/api/health` reports D1/KV readiness but does not expose secret values.
3. Confirm Turnstile is restricted to the final hostname.
4. Confirm verification links are single-use and expire after 30 minutes.
5. Confirm an unverified account cannot create a session.
6. Confirm five failed password checks lock an account for 15 minutes.
7. Confirm logout deletes the KV session and account `auth_version` invalidates older sessions.
8. Confirm Terms and Privacy text have been approved for the operating company and jurisdiction before registration is enabled.
