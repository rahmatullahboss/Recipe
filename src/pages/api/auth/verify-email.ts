import type { APIRoute } from "astro";
import {
  CSRF_COOKIE,
  isSameOriginRequest,
  safeNextPath,
  validateCsrfToken,
} from "../../../lib/auth";
import { recordAuthAudit } from "../../../lib/auth/audit";
import { consumeEmailVerificationToken } from "../../../lib/email-verification";

function verificationRedirect(request: Request, error: string, next: string): Response {
  const url = new URL("/verify-email", request.url);
  url.searchParams.set("error", error);
  if (next !== "/account") url.searchParams.set("next", next);
  return Response.redirect(url, 303);
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const form = await request.formData();
  const nonce = cookies.get(CSRF_COOKIE)?.value;
  const next = safeNextPath(form.get("next"));

  if (!isSameOriginRequest(request) || !await validateCsrfToken("verify-email", nonce, form.get("csrfToken"))) {
    await recordAuthAudit(request, {
      eventType: "email_verified",
      outcome: "blocked",
      metadata: { reason: "request_validation" },
    });
    return verificationRedirect(request, "request", next);
  }

  try {
    const verified = await consumeEmailVerificationToken(form.get("token"));
    if (!verified) {
      await recordAuthAudit(request, {
        eventType: "email_verified",
        outcome: "failure",
        metadata: { reason: "invalid_or_expired_token" },
      });
      return verificationRedirect(request, "invalid", next);
    }

    await recordAuthAudit(request, {
      eventType: "email_verified",
      outcome: "success",
    });
    const login = new URL("/login", request.url);
    login.searchParams.set("verified", "1");
    if (next !== "/account") login.searchParams.set("next", next);
    return Response.redirect(login, 303);
  } catch (error) {
    console.error("Email verification failed unexpectedly.", error);
    await recordAuthAudit(request, {
      eventType: "email_verified",
      outcome: "failure",
      metadata: { reason: "internal" },
    });
    return verificationRedirect(request, "unavailable", next);
  }
};
