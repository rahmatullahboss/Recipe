# Cloudflare and GitHub CI/CD Setup

This project currently deploys without D1. The international static catalogue is used until the D1 account limit is available again.

## 1. Enable the Cloudflare services

In the Cloudflare dashboard, confirm the following for the target account:

1. Workers & Pages is enabled and a `workers.dev` subdomain has been registered.
2. R2 has been activated. The free included usage is sufficient for initial development, but Cloudflare still requires the R2 checkout/activation flow.
3. Cloudflare Images is available if runtime image transformations will be used.
4. A domain is active in Cloudflare only if a custom production domain will be connected immediately.

Wrangler can automatically provision the `SESSION` KV namespace, `MEDIA` R2 bucket, and `IMAGES` binding during the first deployment because the default config declares draft bindings without account-specific IDs.

## 2. Create the deployment API token

In Cloudflare:

1. Open **My Profile → API Tokens → Create Token**.
2. Start from the **Edit Cloudflare Workers** template.
3. Restrict the token to the Cloudflare account used for this project.
4. Keep or add these permissions:

### Required now

- Account → Workers Scripts → Edit
- Account → Workers KV Storage → Edit
- Account → Workers R2 Storage → Edit
- Account → Account Settings → Read
- User → User Details → Read
- User → Memberships → Read

### Required for a custom domain

- Zone → Workers Routes → Edit for the selected zone

### Required for future Cloudflare Images uploads/management

- Account → Cloudflare Images → Edit

### Required later for D1 migrations

- Account → D1 → Edit

Do not save the token in the repository or in a committed `.env` file.

## 3. Find the Cloudflare Account ID

Open the target Cloudflare account. Copy the **Account ID** from the dashboard account details or from a zone overview.

## 4. Configure GitHub secrets

In the GitHub repository:

1. Open **Settings → Environments**.
2. Create an environment named `production`.
3. Add these environment secrets:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

Recommended environment protection:

- Restrict deployment branches to `main`.
- Optionally require manual approval before production deployments.
- Prevent administrators from bypassing protection rules if stronger release control is required.

## 5. Enable GitHub Actions

Open **Settings → Actions → General** and confirm:

- Actions are allowed for the repository.
- Actions from GitHub and verified creators are allowed.
- Workflow permissions have at least read access to repository contents.

The workflows request their own minimal permissions.

## 6. Current automatic deployment

The default deployment is handled by:

```text
.github/workflows/deploy.yml
```

It runs when changes reach `main` and performs:

```bash
npm ci
npm run build
wrangler deploy --config wrangler.jsonc
```

`wrangler.jsonc` contains no D1 binding. The deployed application automatically uses `src/data/fallback-recipes.ts`.

## 7. First deployment checks

After the first successful workflow:

1. Open the deployment URL shown in the GitHub Actions summary.
2. Check `/api/health`.
3. Confirm the response contains:

```json
{
  "ok": true,
  "runtime": "cloudflare-workers",
  "dataMode": "static-fallback"
}
```

4. Open the homepage from different countries or use the market selector.
5. Confirm an R2 bucket and KV namespace were created and bound to the Worker.
6. Check Worker logs and observability in Cloudflare.

## 8. Connect a custom domain

After the Worker is deployed:

1. Open **Workers & Pages → ozzyl-recipes → Settings → Domains & Routes**.
2. Add the production custom domain.
3. Keep the Worker name and `wrangler.jsonc` as the configuration source of truth.
4. Re-run the production deployment after DNS and certificate status are active.

## 9. Enable D1 later

Do not run this section while the account is still at its D1 limit.

When D1 becomes available:

1. Add **D1 Edit** to `CLOUDFLARE_API_TOKEN` or replace the token with one that has it.
2. Open **GitHub → Actions → Enable D1 and Deploy**.
3. Select **Run workflow**.
4. Enter exactly:

```text
ENABLE_D1
```

The workflow will:

```bash
npm ci
npm run build:d1
wrangler d1 migrations apply DB --remote --config wrangler.d1.jsonc
wrangler deploy --config wrangler.d1.jsonc
```

The D1 config uses the `DB` binding and the migrations in `migrations/`.

After deployment, `/api/health` should return:

```json
{
  "dataMode": "d1"
}
```

## 10. Rollback strategy

- Cloudflare Worker deployments can be rolled back from the Worker deployment history.
- D1 creates a backup before applying migrations.
- A failed D1 migration is rolled back while earlier successful migrations remain applied.
- The static fallback catalogue remains in the repository, so the D1-free config can be redeployed if the database is temporarily unavailable.

## 11. Do not add yet

The current workflows do not require these secrets yet:

- Email provider API key
- Authentication/session signing secret
- Turnstile secret key
- Analytics API token
- AI provider keys

Add each secret only when its feature is implemented and declare required Worker secrets in `wrangler.jsonc` at that time.
