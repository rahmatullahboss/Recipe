import { env } from "cloudflare:workers";
import { AuthServiceError, createRandomToken, normaliseEmail } from "./auth";

const encoder = new TextEncoder();
const VERIFICATION_TTL_SECONDS = 60 * 30;

const bindings = env as unknown as {
  DB?: D1Database;
};

type VerificationRecord = {
  id: string;
  user_id: string;
  target_email: string | null;
};

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createEmailVerificationToken(user: { id: string; email: string }): Promise<string> {
  const database = bindings.DB;
  if (!database) throw new AuthServiceError("unavailable", "Verification token storage is not configured.");

  const token = createRandomToken(32);
  const digest = await sha256(token);
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_SECONDS * 1000).toISOString();
  const email = normaliseEmail(user.email);

  await database.batch([
    database.prepare(
      `UPDATE auth_tokens
       SET consumed_at = COALESCE(consumed_at, CURRENT_TIMESTAMP)
       WHERE user_id = ? AND purpose = 'email_verification' AND consumed_at IS NULL`,
    ).bind(user.id),
    database.prepare(
      `INSERT INTO auth_tokens (
        id, user_id, purpose, token_hash, target_email, expires_at
      ) VALUES (?, ?, 'email_verification', ?, ?, ?)`,
    ).bind(crypto.randomUUID(), user.id, digest, email, expiresAt),
  ]);

  return token;
}

export async function consumeEmailVerificationToken(tokenInput: unknown): Promise<boolean> {
  const database = bindings.DB;
  if (!database || typeof tokenInput !== "string" || tokenInput.length < 32 || tokenInput.length > 256) {
    return false;
  }

  const digest = await sha256(tokenInput);
  const record = await database.prepare(
    `SELECT id, user_id, target_email
     FROM auth_tokens
     WHERE token_hash = ?
       AND purpose = 'email_verification'
       AND consumed_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
  ).bind(digest).first<VerificationRecord>();
  if (!record) return false;

  const results = await database.batch([
    database.prepare(
      `UPDATE auth_tokens
       SET consumed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
    ).bind(record.id),
    database.prepare(
      `UPDATE users
       SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP),
           status = CASE WHEN status = 'pending_verification' THEN 'active' ELSE status END
       WHERE id = ?
         AND status IN ('pending_verification', 'active')
         AND (? IS NULL OR email = ? COLLATE NOCASE)`,
    ).bind(record.user_id, record.target_email, record.target_email),
  ]);

  return Boolean(
    results[0]?.success
    && (results[0].meta.changes ?? 0) === 1
    && results[1]?.success
    && (results[1].meta.changes ?? 0) === 1,
  );
}
