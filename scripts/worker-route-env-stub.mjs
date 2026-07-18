const initialUserRow = () => ({
  id: "route-user-0001",
  email: "route-user@example.invalid",
  username: "route_user",
  display_name: "Route Acceptance User",
  role: "member",
  password_hash: null,
  email_verified_at: "2026-01-01T00:00:00.000Z",
  status: "active",
  auth_version: 1,
  preferred_locale: "en",
  created_at: "2026-01-01T00:00:00.000Z",
  failed_login_count: 0,
  locked_until: null,
});

const state = {
  userRow: initialUserRow(),
  rateLimitOverride: null,
};

class MemoryKv {
  values = new Map();

  async get(key, type) {
    if (key.startsWith("auth:rate:") && state.rateLimitOverride !== null) {
      return String(state.rateLimitOverride);
    }
    const value = this.values.get(key);
    if (value === undefined) return null;
    if (type === "json") return JSON.parse(value);
    return value;
  }

  async put(key, value) {
    this.values.set(key, String(value));
  }

  async delete(key) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }

  entries() {
    return [...this.values.entries()];
  }
}

class AuthDatabaseStub {
  prepare(sql) {
    return {
      bind: (...values) => ({
        first: async () => {
          if (!sql.includes("FROM users") || !sql.includes("WHERE id = ?")) {
            throw new Error(`Unexpected route acceptance D1 read: ${sql}`);
          }
          if (!state.userRow || values[0] !== state.userRow.id) return null;
          return structuredClone(state.userRow);
        },
        run: async () => ({ success: true, meta: { changes: 0 } }),
      }),
    };
  }
}

const sessionStore = new MemoryKv();
const database = new AuthDatabaseStub();

export const env = {
  DB: database,
  SESSION: sessionStore,
  AUTH_ENABLED: "true",
  AUTH_REGISTRATION_ENABLED: "false",
  AUTH_PASSWORD_PEPPER: "route-acceptance-password-pepper-2026",
  AUTH_FINGERPRINT_PEPPER: "route-acceptance-fingerprint-pepper-2026",
  TURNSTILE_SITE_KEY: "route-acceptance-site-key",
  TURNSTILE_SECRET_KEY: "route-acceptance-secret-key",
  MEDIA_UPLOADS_ENABLED: "false",
  RECIPE_SUBMISSIONS_ENABLED: "false",
};

export function resetWorkerRouteTestEnvironment() {
  sessionStore.clear();
  state.userRow = initialUserRow();
  state.rateLimitOverride = null;
  env.DB = database;
  env.SESSION = sessionStore;
  env.AUTH_ENABLED = "true";
  env.AUTH_REGISTRATION_ENABLED = "false";
  env.AUTH_PASSWORD_PEPPER = "route-acceptance-password-pepper-2026";
  env.AUTH_FINGERPRINT_PEPPER = "route-acceptance-fingerprint-pepper-2026";
  env.TURNSTILE_SITE_KEY = "route-acceptance-site-key";
  env.TURNSTILE_SECRET_KEY = "route-acceptance-secret-key";
  env.MEDIA_UPLOADS_ENABLED = "false";
  env.RECIPE_SUBMISSIONS_ENABLED = "false";
}

export function setRouteAuthUserState({ status, authVersion, emailVerified } = {}) {
  if (!state.userRow) state.userRow = initialUserRow();
  if (status !== undefined) state.userRow.status = status;
  if (authVersion !== undefined) state.userRow.auth_version = authVersion;
  if (emailVerified !== undefined) {
    state.userRow.email_verified_at = emailVerified ? "2026-01-01T00:00:00.000Z" : null;
  }
}

export function routeAuthUserRow() {
  return state.userRow ? structuredClone(state.userRow) : null;
}

export function setRouteRateLimitOverride(value) {
  state.rateLimitOverride = value === null ? null : Number(value);
}

export function routeKvEntries() {
  return sessionStore.entries();
}
