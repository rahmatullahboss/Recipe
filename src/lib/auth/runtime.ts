import { env } from "cloudflare:workers";

export type AuthBindings = {
  DB?: D1Database;
  SESSION?: KVNamespace;
  AUTH_ENABLED?: string;
  AUTH_PASSWORD_PEPPER?: string;
  AUTH_FINGERPRINT_PEPPER?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
};

export type AuthRuntimeStatus = {
  enabled: boolean;
  ready: boolean;
  hasDatabase: boolean;
  hasSessionStore: boolean;
  hasPasswordPepper: boolean;
  hasFingerprintPepper: boolean;
  hasTurnstileSiteKey: boolean;
  hasTurnstileSecret: boolean;
  missing: string[];
  siteKey: string | null;
};

export function getAuthBindings(): AuthBindings {
  return env as unknown as AuthBindings;
}

export function getAuthRuntimeStatus(): AuthRuntimeStatus {
  const bindings = getAuthBindings();
  const enabled = bindings.AUTH_ENABLED?.trim().toLowerCase() === "true";
  const hasDatabase = Boolean(bindings.DB);
  const hasSessionStore = Boolean(bindings.SESSION);
  const hasPasswordPepper = Boolean(bindings.AUTH_PASSWORD_PEPPER?.trim());
  const hasFingerprintPepper = Boolean(bindings.AUTH_FINGERPRINT_PEPPER?.trim());
  const hasTurnstileSiteKey = Boolean(bindings.TURNSTILE_SITE_KEY?.trim());
  const hasTurnstileSecret = Boolean(bindings.TURNSTILE_SECRET_KEY?.trim());
  const missing: string[] = [];

  if (!enabled) missing.push("AUTH_ENABLED");
  if (!hasDatabase) missing.push("DB");
  if (!hasSessionStore) missing.push("SESSION");
  if (!hasPasswordPepper) missing.push("AUTH_PASSWORD_PEPPER");
  if (!hasFingerprintPepper) missing.push("AUTH_FINGERPRINT_PEPPER");
  if (!hasTurnstileSiteKey) missing.push("TURNSTILE_SITE_KEY");
  if (!hasTurnstileSecret) missing.push("TURNSTILE_SECRET_KEY");

  return {
    enabled,
    ready: missing.length === 0,
    hasDatabase,
    hasSessionStore,
    hasPasswordPepper,
    hasFingerprintPepper,
    hasTurnstileSiteKey,
    hasTurnstileSecret,
    missing,
    siteKey: bindings.TURNSTILE_SITE_KEY?.trim() || null,
  };
}

export function requireAuthDatabase(): D1Database {
  const database = getAuthBindings().DB;
  if (!database) throw new Error("D1 authentication database is not configured.");
  return database;
}

export function requireSessionStore(): KVNamespace {
  const session = getAuthBindings().SESSION;
  if (!session) throw new Error("KV session store is not configured.");
  return session;
}
