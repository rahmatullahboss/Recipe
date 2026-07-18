import assert from "node:assert/strict";
import {
  createCsrfToken,
  createSession,
  CSRF_COOKIE,
  getAuthContext,
  getAuthReadiness,
} from "../src/lib/auth.ts";
import { POST } from "../src/pages/api/recipe-change-sets/[id]/rebase.ts";
import {
  resetWorkerRouteTestEnvironment,
  routeAuthUserRow,
  routeKvEntries,
  setRouteAuthUserState,
  setRouteRateLimitOverride,
} from "./worker-route-env-stub.mjs";
import {
  configureRebaseRouteStub,
  lastRebaseRouteInput,
  resetRebaseRouteStub,
} from "./worker-route-conflict-stub.mjs";

const ORIGIN = "https://recipes.test";
const CHANGE_SET_ID = "recipe_change_11111111-1111-4111-8111-111111111111";
const NONCE = "route-acceptance-nonce";
const SESSION_CSRF = "route-session-csrf";

function authUserFromRow(row) {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    emailVerified: Boolean(row.email_verified_at),
    status: row.status,
    authVersion: row.auth_version,
    preferredLocale: row.preferred_locale,
    createdAt: row.created_at,
  };
}

function validLocals() {
  const row = routeAuthUserRow();
  return {
    authReady: true,
    user: authUserFromRow(row),
    session: {
      key: "route-session-key",
      userId: row.id,
      csrfToken: SESSION_CSRF,
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
      authVersion: row.auth_version,
    },
  };
}

function cookieJar(nonce = NONCE) {
  return {
    get(name) {
      return name === CSRF_COOKIE && nonce ? { value: nonce } : undefined;
    },
  };
}

async function validPayload(overrides = {}) {
  return {
    csrfToken: await createCsrfToken("recipe-change-set-rebase", NONCE),
    sessionCsrf: SESSION_CSRF,
    expectedRevision: 2,
    resolutions: {
      title: "proposed",
      ingredients: "live",
    },
    ...overrides,
  };
}

async function invokeRoute({
  body,
  rawBody,
  id = CHANGE_SET_ID,
  locals = validLocals(),
  cookies = cookieJar(),
  origin = ORIGIN,
  referer,
  contentType = "application/json",
  contentLength,
} = {}) {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  if (referer) headers.set("referer", referer);
  if (contentType !== null) headers.set("content-type", contentType);
  if (contentLength !== undefined) headers.set("content-length", String(contentLength));
  const request = new Request(`${ORIGIN}/api/recipe-change-sets/${id}/rebase`, {
    method: "POST",
    headers,
    body: rawBody ?? JSON.stringify(body ?? {}),
  });
  const response = await POST({ request, cookies, locals, params: { id } });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const payload = await response.json();
  return { response, payload };
}

async function testVerifiedSessionLifecycle() {
  resetWorkerRouteTestEnvironment();
  const readiness = getAuthReadiness();
  assert.equal(readiness.ready, true);

  const user = authUserFromRow(routeAuthUserRow());
  const { token, session } = await createSession(user);
  const authenticated = await getAuthContext(new Request(`${ORIGIN}/account`, {
    headers: { cookie: `__Host-ozzyl_session=${encodeURIComponent(token)}` },
  }));
  assert.equal(authenticated.user?.id, user.id);
  assert.equal(authenticated.session?.csrfToken, session.csrfToken);

  setRouteAuthUserState({ authVersion: 2 });
  const revoked = await getAuthContext(new Request(`${ORIGIN}/account`, {
    headers: { cookie: `__Host-ozzyl_session=${encodeURIComponent(token)}` },
  }));
  assert.equal(revoked.user, null, "An auth-version change must revoke the stored session.");
  assert.equal(routeKvEntries().some(([key]) => key.startsWith("auth:session:")), false);

  resetWorkerRouteTestEnvironment();
  const secondUser = authUserFromRow(routeAuthUserRow());
  const second = await createSession(secondUser);
  setRouteAuthUserState({ status: "suspended" });
  const suspended = await getAuthContext(new Request(`${ORIGIN}/account`, {
    headers: { cookie: `__Host-ozzyl_session=${encodeURIComponent(second.token)}` },
  }));
  assert.equal(suspended.user, null, "A suspended account must not retain a usable session.");
}

async function testRequestGuardsAndStatusMapping() {
  resetWorkerRouteTestEnvironment();
  resetRebaseRouteStub();

  let result = await invokeRoute({
    body: {},
    locals: { authReady: false, user: null, session: null },
  });
  assert.equal(result.response.status, 401);

  result = await invokeRoute({ body: await validPayload(), origin: "https://attacker.invalid" });
  assert.equal(result.response.status, 403);
  assert.match(result.payload.error, /origin/i);

  result = await invokeRoute({ body: await validPayload(), origin: null });
  assert.equal(result.response.status, 403, "A write request without Origin or Referer must fail closed.");

  result = await invokeRoute({ body: await validPayload(), contentType: "text/plain" });
  assert.equal(result.response.status, 415);

  result = await invokeRoute({ body: await validPayload(), contentLength: 20_001 });
  assert.equal(result.response.status, 413);

  result = await invokeRoute({ body: await validPayload(), id: "not-a-change-set" });
  assert.equal(result.response.status, 400);

  result = await invokeRoute({ rawBody: "{" });
  assert.equal(result.response.status, 400);

  result = await invokeRoute({
    body: { ...(await validPayload()), csrfToken: await createCsrfToken("different-purpose", NONCE) },
  });
  assert.equal(result.response.status, 403, "A CSRF token for another purpose must be rejected.");

  result = await invokeRoute({
    body: { ...(await validPayload()), sessionCsrf: "wrong-session-csrf" },
  });
  assert.equal(result.response.status, 403);

  result = await invokeRoute({ body: await validPayload({ expectedRevision: 0 }) });
  assert.equal(result.response.status, 422);

  result = await invokeRoute({ body: await validPayload({ resolutions: null }) });
  assert.equal(result.response.status, 422);

  result = await invokeRoute({ body: await validPayload({ resolutions: { unknownField: "live" } }) });
  assert.equal(result.response.status, 422);

  result = await invokeRoute({ body: await validPayload({ resolutions: { title: "automatic" } }) });
  assert.equal(result.response.status, 422);

  setRouteRateLimitOverride(30);
  result = await invokeRoute({ body: await validPayload() });
  assert.equal(result.response.status, 429);
  assert.equal(lastRebaseRouteInput(), null, "Rate-limited requests must not call the rebase service.");
  setRouteRateLimitOverride(null);

  for (const [code, expectedStatus] of [
    ["invalid", 422],
    ["conflict", 409],
    ["forbidden", 403],
    ["unavailable", 503],
  ]) {
    configureRebaseRouteStub({ kind: "service_error", code, message: `Synthetic ${code} response.` });
    result = await invokeRoute({ body: await validPayload() });
    assert.equal(result.response.status, expectedStatus);
    assert.equal(result.payload.error, `Synthetic ${code} response.`);
  }

  configureRebaseRouteStub({ kind: "error", message: "Synthetic unknown failure." });
  const originalConsoleError = console.error;
  let logged = false;
  console.error = () => { logged = true; };
  try {
    result = await invokeRoute({ body: await validPayload() });
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(result.response.status, 503);
  assert.equal(logged, true);
  assert.equal(result.payload.error, "Private conflict resolution is temporarily unavailable.");

  resetRebaseRouteStub();
  result = await invokeRoute({
    body: await validPayload(),
    origin: null,
    referer: `${ORIGIN}/account/change-sets/${CHANGE_SET_ID}/conflicts`,
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.changeSet.revision, 3);
  assert.deepEqual(lastRebaseRouteInput(), {
    changeSetId: CHANGE_SET_ID,
    actor: { id: "route-user-0001", role: "member" },
    expectedRevision: 2,
    resolutions: {
      title: "proposed",
      ingredients: "live",
    },
  });
  assert.equal(routeKvEntries().some(([key, value]) => key.startsWith("auth:rate:") && value === "1"), true);
}

await testVerifiedSessionLifecycle();
await testRequestGuardsAndStatusMapping();
console.log("Verified session revocation and rebase request-handler guards with synthetic local bindings.");
