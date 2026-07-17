import { env } from "cloudflare:workers";

const encoder = new TextEncoder();
const PASSWORD_ITERATIONS = 600_000;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const CSRF_TTL_SECONDS = 60 * 30;
const SESSION_COOKIE_PRODUCTION = "__Host-ozzyl_session";
const SESSION_COOKIE_DEVELOPMENT = "ozzyl_session";
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_LOCK_SECONDS = 15 * 60;
export const CSRF_COOKIE = "ozzyl_csrf";

export type AuthBindings = {
  DB?: D1Database;
  SESSION?: KVNamespace;
  AUTH_ENABLED?: string;
  AUTH_REGISTRATION_ENABLED?: string;
  AUTH_PASSWORD_PEPPER?: string;
  AUTH_FINGERPRINT_PEPPER?: string;
  AUTH_EMAIL_WEBHOOK_URL?: string;
  AUTH_EMAIL_WEBHOOK_TOKEN?: string;
  AUTH_FROM_EMAIL?: string;
  AUTH_EXPOSE_DEV_VERIFICATION_LINKS?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
};

const bindings = env as unknown as AuthBindings;

export type AuthUserStatus = "pending_verification" | "active" | "locked" | "suspended" | "deleted";

export type AuthUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: "member" | "editor" | "admin";
  emailVerified: boolean;
  status: AuthUserStatus;
  authVersion: number;
  preferredLocale: string;
  createdAt: string;
};

export type AuthSession = {
  key: string;
  userId: string;
  csrfToken: string;
  createdAt: string;
  expiresAt: string;
  authVersion: number;
};

export type AuthContext = {
  user: AuthUser | null;
  session: AuthSession | null;
};

export type AuthReadiness = {
  enabled: boolean;
  ready: boolean;
  registrationEnabled: boolean;
  registrationReady: boolean;
  database: boolean;
  sessions: boolean;
  turnstileSiteKey: boolean;
  turnstileSecret: boolean;
  passwordPepper: boolean;
  emailDelivery: boolean;
  siteKey: string | null;
  missing: string[];
  registrationMissing: string[];
};

type UserRow = {
  id: string;
  email: string;
  username: string;
  display_name: string;
  role: string;
  password_hash: string | null;
  email_verified_at: string | null;
  status: string | null;
  auth_version: number | null;
  preferred_locale: string | null;
  created_at: string;
  failed_login_count: number | null;
  locked_until: string | null;
};

type StoredSession = Omit<AuthSession, "key">;
type TurnstileResult = { success?: boolean; hostname?: string; action?: string; "error-codes"?: string[] };

export class AuthServiceError extends Error {
  constructor(
    public readonly code: "unavailable" | "invalid" | "duplicate" | "rate_limited" | "forbidden",
    message: string,
  ) {
    super(message);
    this.name = "AuthServiceError";
  }
}

function flag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function getAuthBindings(): AuthBindings {
  return bindings;
}

function getDatabase(): D1Database | undefined {
  return bindings.DB;
}

function getSessionStore(): KVNamespace | undefined {
  return bindings.SESSION;
}

function getPepper(): string | undefined {
  const value = bindings.AUTH_PASSWORD_PEPPER?.trim();
  return value || undefined;
}

export function getAuthReadiness(): AuthReadiness {
  const state = {
    enabled: flag(bindings.AUTH_ENABLED),
    registrationEnabled: flag(bindings.AUTH_REGISTRATION_ENABLED),
    database: Boolean(getDatabase()),
    sessions: Boolean(getSessionStore()),
    turnstileSiteKey: Boolean(bindings.TURNSTILE_SITE_KEY?.trim()),
    turnstileSecret: Boolean(bindings.TURNSTILE_SECRET_KEY?.trim()),
    passwordPepper: Boolean(getPepper()),
    emailDelivery: Boolean(bindings.AUTH_EMAIL_WEBHOOK_URL?.trim() && bindings.AUTH_EMAIL_WEBHOOK_TOKEN?.trim()),
  };
  const missing: string[] = [];
  if (!state.enabled) missing.push("AUTH_ENABLED=true");
  if (!state.database) missing.push("D1 account database");
  if (!state.sessions) missing.push("KV session binding");
  if (!state.turnstileSiteKey) missing.push("Turnstile site key");
  if (!state.turnstileSecret) missing.push("Turnstile secret key");
  if (!state.passwordPepper) missing.push("password pepper secret");

  const registrationMissing = [...missing];
  if (!state.registrationEnabled) registrationMissing.push("AUTH_REGISTRATION_ENABLED=true");
  if (!state.emailDelivery) registrationMissing.push("verification email webhook");

  return {
    ...state,
    ready: missing.length === 0,
    registrationReady: registrationMissing.length === 0,
    siteKey: bindings.TURNSTILE_SITE_KEY?.trim() || null,
    missing,
    registrationMissing,
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function createRandomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const pepper = getPepper();
  if (!pepper) throw new AuthServiceError("unavailable", "Password protection is not configured.");
  const pepperKey = await crypto.subtle.importKey("raw", encoder.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prehash = await crypto.subtle.sign("HMAC", pepperKey, encoder.encode(password));
  const keyMaterial = await crypto.subtle.importKey("raw", prehash, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, keyMaterial, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await derivePasswordHash(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2-sha256-hmacpepper-v1$${PASSWORD_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, iterationText, saltText, hashText] = encoded.split("$");
  const iterations = Number(iterationText);
  if (algorithm !== "pbkdf2-sha256-hmacpepper-v1" || !Number.isInteger(iterations) || iterations < PASSWORD_ITERATIONS || iterations > 1_000_000 || !saltText || !hashText) return false;
  try {
    const expected = base64UrlToBytes(hashText);
    const actual = await derivePasswordHash(password, base64UrlToBytes(saltText), iterations);
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function normaliseEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validateRegistrationInput(input: {
  email: unknown;
  displayName: unknown;
  password: unknown;
  termsAccepted?: unknown;
  policyVersion?: unknown;
}) {
  const email = normaliseEmail(input.email);
  const displayName = typeof input.displayName === "string" ? input.displayName.trim().replace(/\s+/g, " ") : "";
  const password = typeof input.password === "string" ? input.password : "";
  const termsAccepted = input.termsAccepted === "on" || input.termsAccepted === "true" || input.termsAccepted === true;
  const policyVersion = typeof input.policyVersion === "string" ? input.policyVersion.trim() : "";
  const errors: string[] = [];
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Enter a valid email address.");
  if (displayName.length < 2 || displayName.length > 80) errors.push("Display name must contain 2 to 80 characters.");
  if (password.length < 12 || password.length > 128) errors.push("Password must contain 12 to 128 characters.");
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) errors.push("Password must include uppercase, lowercase, and numeric characters.");
  if (email && password.toLowerCase().includes(email.split("@")[0] || "\u0000")) errors.push("Password must not contain the email username.");
  if (!termsAccepted || !policyVersion) errors.push("Accept the current terms and privacy notice.");
  return { email, displayName, password, termsAccepted, policyVersion, errors };
}

function normaliseStatus(value: string | null): AuthUserStatus {
  if (value === "pending_verification" || value === "active" || value === "locked" || value === "suspended" || value === "deleted") return value;
  return "suspended";
}

function rowToUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    role: row.role === "admin" || row.role === "editor" ? row.role : "member",
    emailVerified: Boolean(row.email_verified_at),
    status: normaliseStatus(row.status),
    authVersion: row.auth_version ?? 1,
    preferredLocale: row.preferred_locale || "en",
    createdAt: row.created_at,
  };
}

const userSelect = `SELECT id, email, username, display_name, role, password_hash, email_verified_at, status, auth_version, preferred_locale, created_at, failed_login_count, locked_until FROM users`;

async function findUserByEmail(email: string): Promise<UserRow | null> {
  const database = getDatabase();
  if (!database) throw new AuthServiceError("unavailable", "Account storage is not configured.");
  return database.prepare(`${userSelect} WHERE email = ? COLLATE NOCASE LIMIT 1`).bind(email).first<UserRow>();
}

export async function findUserById(userId: string): Promise<AuthUser | null> {
  const database = getDatabase();
  if (!database) return null;
  const row = await database.prepare(`${userSelect} WHERE id = ? LIMIT 1`).bind(userId).first<UserRow>();
  return row ? rowToUser(row) : null;
}

export async function registerUser(input: { email: unknown; displayName: unknown; password: unknown; termsAccepted?: unknown; policyVersion?: unknown }): Promise<AuthUser> {
  const readiness = getAuthReadiness();
  if (!readiness.registrationReady) throw new AuthServiceError("unavailable", "Account registration is not configured.");
  const validated = validateRegistrationInput(input);
  if (validated.errors.length) throw new AuthServiceError("invalid", validated.errors.join(" "));
  const database = getDatabase()!;
  if (await findUserByEmail(validated.email)) throw new AuthServiceError("duplicate", "An account already exists for this email address.");

  const id = crypto.randomUUID();
  const username = `member-${createRandomToken(8).toLowerCase()}`;
  const passwordHash = await hashPassword(validated.password);
  const now = new Date().toISOString();
  try {
    await database.batch([
      database.prepare(`INSERT INTO users (id, email, username, display_name, password_hash, role, email_verified_at, status, auth_version, password_algorithm, password_changed_at, preferred_locale, terms_accepted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'member', NULL, 'pending_verification', 1, 'pbkdf2-sha256-hmacpepper-v1', ?, 'en', ?, ?, ?)`).bind(id, validated.email, username, validated.displayName, passwordHash, now, now, now, now),
      database.prepare(`INSERT INTO user_consents (id, user_id, consent_type, document_version, accepted_at, source) VALUES (?, ?, 'terms', ?, ?, 'web')`).bind(crypto.randomUUID(), id, validated.policyVersion, now),
      database.prepare(`INSERT INTO user_consents (id, user_id, consent_type, document_version, accepted_at, source) VALUES (?, ?, 'privacy', ?, ?, 'web')`).bind(crypto.randomUUID(), id, validated.policyVersion, now),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unique") || message.includes("constraint")) throw new AuthServiceError("duplicate", "An account already exists for this email address.");
    throw error;
  }
  const user = await findUserById(id);
  if (!user) throw new AuthServiceError("unavailable", "The account could not be loaded after registration.");
  return user;
}

export async function deletePendingRegistration(userId: string): Promise<void> {
  const database = getDatabase();
  if (database) await database.prepare("DELETE FROM users WHERE id = ? AND status = 'pending_verification' AND email_verified_at IS NULL").bind(userId).run();
}

const DUMMY_PASSWORD_HASH = "pbkdf2-sha256-hmacpepper-v1$600000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export async function authenticateUser(emailInput: unknown, passwordInput: unknown): Promise<AuthUser | null> {
  if (!getAuthReadiness().ready) throw new AuthServiceError("unavailable", "Account sign-in is not configured.");
  const email = normaliseEmail(emailInput);
  const password = typeof passwordInput === "string" ? passwordInput : "";
  const database = getDatabase()!;
  const row = email ? await findUserByEmail(email) : null;
  const validPassword = password.length <= 128 && await verifyPassword(password, row?.password_hash || DUMMY_PASSWORD_HASH);
  const now = Date.now();
  const lockedUntil = row?.locked_until ? Date.parse(row.locked_until) : Number.NaN;
  const lockActive = Number.isFinite(lockedUntil) && lockedUntil > now;

  if (row?.status === "locked" && !lockActive) {
    await database.prepare("UPDATE users SET status = 'active', failed_login_count = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id).run();
    row.status = "active";
    row.failed_login_count = 0;
    row.locked_until = null;
  }

  const usable = Boolean(row && row.status === "active" && row.email_verified_at);
  if (!row || !validPassword || lockActive || !usable) {
    if (row && !validPassword && !lockActive && row.status !== "suspended" && row.status !== "deleted") {
      const failures = (row.failed_login_count ?? 0) + 1;
      const shouldLock = failures >= LOGIN_FAILURE_LIMIT;
      const nextLock = shouldLock ? new Date(now + LOGIN_LOCK_SECONDS * 1000).toISOString() : null;
      await database.prepare(`UPDATE users SET failed_login_count = ?, locked_until = ?, status = CASE WHEN ? = 1 AND status = 'active' THEN 'locked' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(failures, nextLock, shouldLock ? 1 : 0, row.id).run();
    }
    return null;
  }

  await database.prepare("UPDATE users SET failed_login_count = 0, locked_until = NULL, status = 'active', last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id).run();
  return rowToUser(row);
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export function getSessionCookieName(request: Request): string {
  return new URL(request.url).protocol === "https:" ? SESSION_COOKIE_PRODUCTION : SESSION_COOKIE_DEVELOPMENT;
}

export function getSessionCookieOptions(request: Request) {
  return { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax" as const, path: "/", maxAge: SESSION_TTL_SECONDS };
}

export function getCsrfCookieOptions(request: Request) {
  return { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "strict" as const, path: "/", maxAge: CSRF_TTL_SECONDS };
}

export async function createSession(user: AuthUser): Promise<{ token: string; session: AuthSession }> {
  if (user.status !== "active" || !user.emailVerified) throw new AuthServiceError("forbidden", "Only verified active accounts can create a session.");
  const store = getSessionStore();
  if (!store) throw new AuthServiceError("unavailable", "Session storage is not configured.");
  const token = createRandomToken(32);
  const key = await sha256Base64Url(token);
  const now = new Date();
  const stored: StoredSession = { userId: user.id, csrfToken: createRandomToken(24), createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString(), authVersion: user.authVersion };
  await store.put(`auth:session:${key}`, JSON.stringify(stored), { expirationTtl: SESSION_TTL_SECONDS });
  return { token, session: { key, ...stored } };
}

export async function destroySession(session: AuthSession | null): Promise<void> {
  const store = getSessionStore();
  if (store && session) await store.delete(`auth:session:${session.key}`);
}

export async function getAuthContext(request: Request): Promise<AuthContext> {
  const readiness = getAuthReadiness();
  const store = getSessionStore();
  if (!readiness.ready || !store) return { user: null, session: null };
  const token = readCookie(request, SESSION_COOKIE_PRODUCTION) ?? readCookie(request, SESSION_COOKIE_DEVELOPMENT);
  if (!token || token.length > 256) return { user: null, session: null };
  const key = await sha256Base64Url(token);
  const stored = await store.get<StoredSession>(`auth:session:${key}`, "json");
  if (!stored || Date.parse(stored.expiresAt) <= Date.now()) {
    if (stored) await store.delete(`auth:session:${key}`);
    return { user: null, session: null };
  }
  const user = await findUserById(stored.userId);
  if (!user || user.status !== "active" || !user.emailVerified || user.authVersion !== stored.authVersion) {
    await store.delete(`auth:session:${key}`);
    return { user: null, session: null };
  }
  return { user, session: { key, ...stored } };
}

export async function createCsrfToken(purpose: string, nonce: string): Promise<string> {
  const pepper = getPepper();
  if (!pepper) throw new AuthServiceError("unavailable", "CSRF protection is not configured.");
  const timestamp = Math.floor(Date.now() / 1000);
  const random = createRandomToken(18);
  const signature = await hmac(pepper, `${purpose}.${nonce}.${timestamp}.${random}`);
  return `${timestamp}.${random}.${signature}`;
}

export async function validateCsrfToken(purpose: string, nonce: string | undefined, token: unknown): Promise<boolean> {
  const pepper = getPepper();
  if (!pepper || !nonce || typeof token !== "string" || token.length > 512) return false;
  const [timestampText, random, signature] = token.split(".");
  const timestamp = Number(timestampText);
  if (!Number.isInteger(timestamp) || !random || !signature || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > CSRF_TTL_SECONDS) return false;
  const expected = await hmac(pepper, `${purpose}.${nonce}.${timestamp}.${random}`);
  return constantTimeEqual(encoder.encode(signature), encoder.encode(expected));
}

export function isSameOriginRequest(request: Request): boolean {
  const expected = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin) return origin === expected;
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try { return new URL(referer).origin === expected; } catch { return false; }
}

function getClientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function consumeRateLimit(request: Request, action: string, subject: string, limit: number, windowSeconds: number): Promise<boolean> {
  const store = getSessionStore();
  if (!store) return false;
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `auth:rate:${await sha256Base64Url(`${action}:${getClientIp(request)}:${normaliseEmail(subject)}:${bucket}`)}`;
  const current = Number(await store.get(key) ?? "0");
  if (current >= limit) return false;
  await store.put(key, String(current + 1), { expirationTtl: windowSeconds });
  return true;
}

export async function verifyTurnstile(request: Request, token: unknown, expectedAction: string): Promise<boolean> {
  const secret = bindings.TURNSTILE_SECRET_KEY?.trim();
  if (!secret || typeof token !== "string" || token.length < 1 || token.length > 2048) return false;
  const body = new URLSearchParams({ secret, response: token, idempotency_key: crypto.randomUUID() });
  const ip = getClientIp(request);
  if (ip !== "unknown") body.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) return false;
  const result = await response.json<TurnstileResult>();
  if (!result.success || (result.action && result.action !== expectedAction)) return false;
  const url = new URL(request.url);
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || !result.hostname || result.hostname === url.hostname;
}

export async function recordAuthAudit(eventType: string, outcome: "success" | "failure" | "blocked", request: Request, userId: string | null = null, metadata: Record<string, unknown> | null = null): Promise<void> {
  const database = getDatabase();
  const fingerprintPepper = bindings.AUTH_FINGERPRINT_PEPPER?.trim() || getPepper();
  if (!database || !fingerprintPepper) return;
  const ipHash = await hmac(fingerprintPepper, getClientIp(request));
  const userAgentHash = await hmac(fingerprintPepper, request.headers.get("user-agent") ?? "unknown");
  await database.prepare(`INSERT INTO auth_audit_events (id, user_id, event_type, outcome, ip_hash, user_agent_hash, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), userId, eventType, outcome, ipHash, userAgentHash, metadata ? JSON.stringify(metadata).slice(0, 4000) : null).run();
}

export function safeNextPath(value: unknown, fallback = "/account"): string {
  if (typeof value !== "string") return fallback;
  const path = value.trim();
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : fallback;
}
