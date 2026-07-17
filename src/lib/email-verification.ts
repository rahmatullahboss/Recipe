import { env } from "cloudflare:workers";
import { AuthServiceError, createRandomToken, normaliseEmail } from "./auth";

const encoder = new TextEncoder();
const VERIFICATION_TTL_SECONDS = 60 * 30;

const bindings = env as unknown as {
  DB?: D1Database;
  SESSION?: KVNamespace;
};

type VerificationRecord = {
  userId: string;
  email: string;
  createdAt: string;
  expiresAt: string;
};

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createEmailVerificationToken(user: { id: string; email: string }): Promise<string> {
  const store = bindings.SESSION;
  if (!store) throw new AuthServiceError("unavailable", "Verification token storage is not configured.");

  const token = createRandomToken(32);
  const digest = await sha256(token);
  const now = new Date();
  const record: VerificationRecord = {
    userId: user.id,
    email: normaliseEmail(user.email),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + VERIFICATION_TTL_SECONDS * 1000).toISOString(),
  };

  await store.put(`auth:verify-email:${digest}`, JSON.stringify(record), {
    expirationTtl: VERIFICATION_TTL_SECONDS,
  });
  return token;
}

export async function consumeEmailVerificationToken(tokenInput: unknown): Promise<boolean> {
  const database = bindings.DB;
  const store = bindings.SESSION;
  if (!database || !store || typeof tokenInput !== "string" || tokenInput.length < 32 || tokenInput.length > 256) {
    return false;
  }

  const digest = await sha256(tokenInput);
  const key = `auth:verify-email:${digest}`;
  const record = await store.get<VerificationRecord>(key, "json");
  if (!record || new Date(record.expiresAt).getTime() <= Date.now()) {
    if (record) await store.delete(key);
    return false;
  }

  const result = await database.prepare(
    `UPDATE users
     SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP)
     WHERE id = ? AND LOWER(email) = ? AND status = 'active'`,
  ).bind(record.userId, normaliseEmail(record.email)).run();

  if (!result.success || (result.meta.changes ?? 0) < 1) return false;
  await store.delete(key);
  return true;
}
