import {
  AuthServiceError,
  createRandomToken,
  getAuthBindings,
  normaliseEmail,
  sha256Base64Url,
} from "./auth";

const VERIFICATION_TTL_SECONDS = 60 * 30;

type VerificationRecord = {
  id: string;
  user_id: string;
  target_email: string | null;
};

async function requestFingerprint(request?: Request): Promise<string | null> {
  if (!request) return null;
  const pepper = getAuthBindings().AUTH_FINGERPRINT_PEPPER?.trim();
  const ip = request.headers.get("cf-connecting-ip");
  return pepper && ip ? sha256Base64Url(`${pepper}:${ip}`) : null;
}

export async function createEmailVerificationToken(
  user: { id: string; email: string },
  request?: Request,
): Promise<{ token: string; tokenId: string; expiresAt: string }> {
  const database = getAuthBindings().DB;
  if (!database) throw new AuthServiceError("unavailable", "Verification token storage is not configured.");

  const token = createRandomToken(32);
  const digest = await sha256Base64Url(token);
  const tokenId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_SECONDS * 1000).toISOString();
  const email = normaliseEmail(user.email);
  const ipHash = await requestFingerprint(request);

  await database.batch([
    database.prepare(
      `UPDATE auth_tokens
       SET consumed_at = COALESCE(consumed_at, CURRENT_TIMESTAMP)
       WHERE user_id = ? AND purpose = 'email_verification' AND consumed_at IS NULL`,
    ).bind(user.id),
    database.prepare(
      `INSERT INTO auth_tokens (
        id, user_id, purpose, token_hash, target_email, requested_ip_hash, expires_at
      ) VALUES (?, ?, 'email_verification', ?, ?, ?, ?)`,
    ).bind(tokenId, user.id, digest, email, ipHash, expiresAt),
  ]);

  return { token, tokenId, expiresAt };
}

async function invalidateToken(tokenId: string): Promise<void> {
  const database = getAuthBindings().DB;
  if (database) {
    await database.prepare(
      "UPDATE auth_tokens SET consumed_at = COALESCE(consumed_at, CURRENT_TIMESTAMP) WHERE id = ?",
    ).bind(tokenId).run();
  }
}

export async function deliverEmailVerification(
  user: { id: string; email: string; displayName: string },
  request: Request,
): Promise<void> {
  const bindings = getAuthBindings();
  const webhookUrl = bindings.AUTH_EMAIL_WEBHOOK_URL?.trim();
  const webhookToken = bindings.AUTH_EMAIL_WEBHOOK_TOKEN?.trim();
  if (!webhookUrl || !webhookToken) {
    throw new AuthServiceError("unavailable", "Verification email delivery is not configured.");
  }

  const issued = await createEmailVerificationToken(user, request);
  const verificationUrl = new URL("/verify-email", request.url);
  verificationUrl.searchParams.set("token", issued.token);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${webhookToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event: "verify_email",
        to: normaliseEmail(user.email),
        from: bindings.AUTH_FROM_EMAIL?.trim() || undefined,
        recipientName: user.displayName,
        verificationUrl: verificationUrl.toString(),
        expiresAt: issued.expiresAt,
      }),
    });

    if (!response.ok) {
      await invalidateToken(issued.tokenId);
      throw new AuthServiceError("unavailable", "Verification email delivery failed.");
    }
  } catch (error) {
    await invalidateToken(issued.tokenId);
    if (error instanceof AuthServiceError) throw error;
    throw new AuthServiceError("unavailable", "Verification email delivery is unavailable.");
  }
}

export async function consumeEmailVerificationToken(tokenInput: unknown): Promise<boolean> {
  const database = getAuthBindings().DB;
  if (!database || typeof tokenInput !== "string" || tokenInput.length < 32 || tokenInput.length > 256) return false;

  const digest = await sha256Base64Url(tokenInput);
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
           status = CASE WHEN status = 'pending_verification' THEN 'active' ELSE status END,
           updated_at = CURRENT_TIMESTAMP
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
