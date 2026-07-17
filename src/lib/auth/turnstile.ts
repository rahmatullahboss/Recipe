import { createOpaqueToken } from "./crypto";
import { getAuthBindings } from "./runtime";

type TurnstileResponse = {
  success?: boolean;
  action?: string;
  hostname?: string;
  challenge_ts?: string;
  "error-codes"?: string[];
};

export type TurnstileVerification = {
  success: boolean;
  errors: string[];
};

export async function verifyTurnstileToken(
  token: string,
  request: Request,
  expectedAction: "login" | "register" | "password_reset",
): Promise<TurnstileVerification> {
  const secret = getAuthBindings().TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return { success: false, errors: ["turnstile-not-configured"] };
  if (!token.trim()) return { success: false, errors: ["missing-input-response"] };

  const body = new URLSearchParams({
    secret,
    response: token,
    idempotency_key: createOpaqueToken(16),
  });
  const remoteIp = request.headers.get("CF-Connecting-IP");
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) return { success: false, errors: ["siteverify-http-error"] };

    const result = await response.json<TurnstileResponse>();
    const errors = result["error-codes"] ?? [];
    if (!result.success) return { success: false, errors: errors.length ? errors : ["verification-failed"] };
    if (result.action && result.action !== expectedAction) {
      return { success: false, errors: ["action-mismatch"] };
    }

    return { success: true, errors: [] };
  } catch {
    return { success: false, errors: ["siteverify-unavailable"] };
  }
}
