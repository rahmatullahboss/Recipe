# Rebase Request-Handler Acceptance

This acceptance suite executes the production Astro rebase API handler and authentication module with synthetic local bindings. It does not deploy a Worker or connect to remote Cloudflare resources.

## Command

```bash
node --experimental-transform-types \
  --import ./scripts/register-cloudflare-test-loader.mjs \
  scripts/test-recipe-change-set-rebase-route.mjs
```

CI runs this command after the twelve local D1 migrations and the comparator/schema conflict acceptance suite, and before both Worker builds.

## Production code executed

The suite imports and executes:

```text
src/lib/auth.ts
src/pages/api/recipe-change-sets/[id]/rebase.ts
```

The following behavior is therefore exercised from production code:

- authentication readiness calculation;
- session creation in the KV interface;
- HTTPS `__Host-ozzyl_session` lookup;
- session hydration through `getAuthContext`;
- account-status and `auth_version` session revocation;
- purpose-bound CSRF creation and validation;
- same-origin Origin/Referer validation;
- KV-backed rate-limit logic;
- rebase request parsing and status mapping;
- private no-store response headers.

## Synthetic bindings

`scripts/worker-route-env-stub.mjs` provides:

- an in-memory KV-compatible session/rate-limit store;
- a minimal D1-compatible user lookup for one synthetic verified account;
- non-secret test authentication and Turnstile configuration values;
- mutable account status and auth-version controls.

`scripts/worker-route-test-loader.mjs` redirects only these runtime dependencies:

- `cloudflare:workers` to the synthetic environment;
- the rebase service to a configurable service stub;
- `RecipeSubmissionError` to a matching test class.

The production route and production authentication implementation are not copied or replaced.

## Verified session behavior

The suite verifies:

1. authentication readiness is true when all synthetic bindings are present;
2. a verified active account can create a session;
3. the HTTPS host cookie resolves the correct user and CSRF session value;
4. incrementing the user's `auth_version` invalidates and deletes the stored session;
5. suspending the account invalidates and deletes a newly created session.

## Verified rebase request guards

Every response is required to include:

```text
Cache-Control: private, no-store
```

The suite verifies these outcomes:

| Case | Expected status |
| --- | ---: |
| Missing verified locals/session | `401` |
| Cross-origin request | `403` |
| Missing both Origin and Referer | `403` |
| Non-JSON content type | `415` |
| Declared body larger than 20,000 bytes | `413` |
| Invalid change-set identifier | `400` |
| Malformed JSON | `400` |
| CSRF token issued for another purpose | `403` |
| Session CSRF mismatch | `403` |
| Invalid optimistic revision | `422` |
| Missing/invalid resolutions object | `422` |
| Unknown conflict field | `422` |
| Choice other than `live` or `proposed` | `422` |
| Exhausted rate limit | `429` |

A rate-limited request must not call the rebase service.

## Verified service status mapping

The production handler maps service outcomes as follows:

| Service outcome | HTTP status |
| --- | ---: |
| `invalid` | `422` |
| `conflict` | `409` |
| `forbidden` | `403` |
| `unavailable` | `503` |
| Unknown exception | generic `503` |

The unknown-exception path must log internally without exposing the synthetic error message to the response.

## Verified success delegation

A same-origin Referer fallback request with valid CSRF/session/revision/resolutions must return `200` and pass exactly these values to the rebase service boundary:

- change-set identifier;
- authenticated actor ID and role;
- expected private change-set revision;
- explicit `live`/`proposed` conflict choices.

The real rebase service is intentionally stubbed so this suite cannot change D1 recipe or change-set state.

## CI diagnostics

The CI step writes output to:

```text
rebase-route-acceptance.log
```

On failure, the log is uploaded as the short-lived artifact:

```text
rebase-route-acceptance-log
```

The artifact is retained for three days and CI then fails. Successful runs skip the artifact.

## What this does not prove

This suite is request-handler acceptance, not a complete deployed Worker test. It does not execute:

- a real Cloudflare Worker HTTP server;
- remote or Miniflare D1 `batch()` behavior for the rebase service;
- real KV consistency behavior;
- R2 originals or derivative objects;
- Cloudflare Images transformations;
- media checksum/moderation/derivative queries through actual bindings;
- concurrent browser requests;
- actual private rebase writes;
- editorial approval or publication;
- protected activation workflows;
- production rollback.

Those remain controlled non-production runtime acceptance tasks using synthetic accounts, recipes, and media only.

## Safety boundary

Checked-in trusted-write flags remain false. The route suite uses synthetic in-memory bindings and a service stub, performs no deployment, and cannot access remote D1, KV, R2, or Images resources.
