# Cloudflare and GitHub CI/CD Setup

The project currently deploys without D1. International discovery, cooking, browser-local planning, saves, offline support, and local recipe drafts remain operational while accounts and trusted writes stay disabled.

Read [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md) for the complete project state, safety boundaries, and continuation prompt.

## 1. Cloudflare services

In the target Cloudflare account, confirm:

1. Workers & Pages is enabled and a `workers.dev` subdomain exists.
2. Workers KV is available for sessions and lightweight security state.
3. R2 is activated for private contributor originals.
4. D1 capacity is available before running the guarded D1 workflow.
5. Cloudflare Images is available only if the future derivative implementation chooses that path.
6. A domain is active in Cloudflare only when a custom hostname will be connected.

Wrangler can provision draft `SESSION` KV, `MEDIA` R2, and `IMAGES` bindings during deployment. D1 is provisioned only through the guarded D1 workflow.

## 2. Deployment API token

Create a restricted API token from **My Profile → API Tokens**.

### Required for the current Worker

- Account → Workers Scripts → Edit
- Account → Workers KV Storage → Edit
- Account → Workers R2 Storage → Edit
- Account → Account Settings → Read
- User → User Details → Read
- User → Memberships → Read

### Required for a custom domain

- Zone → Workers Routes → Edit for the selected zone

### Required for D1 activation

- Account → D1 → Edit

### Required only if managing Cloudflare Images

- Account → Cloudflare Images → Edit

Never commit the token or store it in a tracked environment file.

## 3. GitHub production environment

Create a GitHub environment named `production` and add:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

Recommended protection:

- restrict deployment branches to `main`;
- require approval for production deployments;
- prevent protection-rule bypass where stricter release control is needed.

The guarded authentication workflow later also reads account peppers, Turnstile values, and optional email-delivery configuration. Follow [`D1_AUTH_SETUP.md`](D1_AUTH_SETUP.md) rather than adding unreviewed secrets.

## 4. GitHub Actions

Under **Settings → Actions → General**, allow repository Actions and verified creator actions. Workflows request the permissions they require.

Current workflows:

- `.github/workflows/ci.yml` — pull-request validation and Worker build
- `.github/workflows/deploy.yml` — D1-free deployment from `main`
- `.github/workflows/enable-d1.yml` — guarded D1 provisioning/migrations with trusted writes disabled
- `.github/workflows/enable-auth.yml` — guarded sign-in plus independent registration, media, and recipe submission/revision inputs

## 5. Current automatic D1-free deployment

`.github/workflows/deploy.yml` runs after changes reach `main`:

```bash
npm ci
npm run build
wrangler deploy --config wrangler.jsonc
```

`wrangler.jsonc` has no D1 binding. Public recipe data comes from `src/data/fallback-recipes.ts`; account and trusted-write routes fail closed.

After deployment, `/api/health` should report the equivalent of:

```json
{
  "ok": true,
  "runtime": "cloudflare-workers",
  "dataMode": "static-fallback"
}
```

The deployment workflow also checks the supported market count and expected KV/R2/Images binding readiness.

## 6. Custom domain

After the Worker deploys:

1. Open **Workers & Pages → ozzyl-recipes → Settings → Domains & Routes**.
2. Add the intended hostname.
3. Keep Wrangler configuration as deployment source of truth.
4. Re-run deployment after DNS and certificate status are active.
5. Restrict Turnstile to the final hostname before authentication is enabled.

## 7. Guarded D1 deployment

Do not run while the account is at its D1 limit or before rollback procedures are understood.

Open **GitHub → Actions → Enable D1 and Deploy** and enter the exact confirmation:

```text
ENABLE_D1
```

The workflow performs the equivalent of:

```bash
npm ci
npm run validate
npm run build:d1
wrangler deploy --config wrangler.d1.jsonc
wrangler d1 migrations apply DB --remote --config wrangler.d1.jsonc
wrangler deploy --config wrangler.d1.jsonc
```

The first deployment provisions the D1 binding. Migrations are then applied before the final D1-mode deployment. Public recipe queries retain static fallback protection if D1 reads fail.

### Authoritative migration layout

Wrangler applies only:

```text
migrations/d1/0001_initial/migration.sql
migrations/d1/0002_seed/migration.sql
migrations/d1/0003_market_coverage/migration.sql
migrations/d1/0004_auth_accounts/migration.sql
migrations/d1/0005_media_pipeline/migration.sql
migrations/d1/0006_recipe_editorial/migration.sql
migrations/d1/0007_recipe_revisions/migration.sql
```

`wrangler.d1.jsonc` uses:

```jsonc
"migrations_pattern": "migrations/d1/*/migration.sql"
```

Root-level SQL files are legacy references and are outside Wrangler's migration path.

After D1 migration, health should report D1 mode while trusted writes remain disabled:

```json
{
  "dataMode": "d1",
  "authentication": {
    "enabled": false,
    "registrationEnabled": false
  },
  "media": {
    "uploadsEnabled": false
  },
  "recipeSubmissions": {
    "enabled": false
  }
}
```

## 8. Fail-closed D1 configuration

Checked-in `wrangler.d1.jsonc` keeps:

```jsonc
"AUTH_ENABLED": "false",
"AUTH_REGISTRATION_ENABLED": "false",
"MEDIA_UPLOADS_ENABLED": "false",
"RECIPE_SUBMISSIONS_ENABLED": "false"
```

D1 reads can therefore operate before any trusted write surface opens.

Do not change checked-in defaults to activate production. The guarded workflow creates runner-only temporary configuration for intentional activation.

## 9. Staged authentication and write activation

Follow [`D1_AUTH_SETUP.md`](D1_AUTH_SETUP.md) for exact dependencies, secrets, test matrices, health assertions, and rollback.

Required order:

1. Apply all seven migrations with every trusted-write flag false.
2. Configure independent password/fingerprint peppers and Turnstile.
3. Enable controlled sign-in while registration, media, and recipe writes remain false.
4. Provision controlled contributor and editor/admin accounts.
5. Test media upload/moderation and then optionally enable media.
6. Test initial recipe submission, requested changes, owner revision, snapshots, publication, and rollback.
7. Optionally enable recipe submissions/revisions while media remains enabled.
8. Approve legal and verification-email operations.
9. Enable public registration separately and last.

Recipe activation is rejected unless media uploads are also requested. Deployed health verification checks recipe readiness plus optimistic locking, requested changes, contributor revisions, and immutable snapshots.

## 10. Privacy-safe image derivatives

Cloudflare Images is declared as an optional future integration, not an active public transformation pipeline.

The next recommended phase should:

- keep R2 originals private;
- normalize orientation;
- strip EXIF and unnecessary metadata;
- create bounded responsive WebP/AVIF variants;
- record derivative lifecycle and source checksum/version;
- serve derivatives only when the parent D1 asset is uploaded and approved;
- define regeneration and cleanup behavior;
- preserve private no-store previews and public cache/ETag guarantees;
- add health, validator, testing, rollback, and documentation.

Do not enable runtime transformation merely because the `IMAGES` binding exists.

## 11. Rollback

- Worker deployments can be rolled back from Cloudflare deployment history.
- D1 creates backup protection around migration application according to the platform workflow.
- A failed migration does not justify manually skipping the authoritative sequence.
- Public D1 query failures fall back to the versioned catalogue.
- `wrangler.jsonc` can redeploy the D1-free application.
- **Enable D1 and Deploy** returns all checked-in trusted-write flags to false.
- Disabling authentication invalidates account access.
- Disabling media closes new intents/uploads but preserves stored assets and approved delivery.
- Disabling recipe submissions closes first submissions, requested changes, resubmissions, publication, and archival writes while preserving normalized rows, snapshots, audit history, and published reads.

## 12. Production verification

Before considering any D1 trusted-write surface ready:

1. Confirm all seven nested migrations are applied.
2. Confirm `/api/health` reports expected bindings/readiness without exposing secrets or private content.
3. Confirm checked-in flags remain false.
4. Confirm Turnstile is restricted to approved hostnames.
5. Confirm verification links are single-use and expire after 30 minutes.
6. Confirm unverified accounts cannot create sessions.
7. Confirm lockout and `auth_version` revocation behavior.
8. Confirm media signature/size/dimension validation and approval-gated delivery.
9. Confirm another contributor cannot access a recipe revision or media asset.
10. Confirm stale resubmission cannot partially replace normalized rows.
11. Confirm publication rechecks approved media in the final write.
12. Confirm Terms, Privacy, retention, moderation, appeal, and deletion procedures are approved before registration or publishing is enabled.
