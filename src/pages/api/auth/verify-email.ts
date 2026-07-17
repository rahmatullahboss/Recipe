import type { APIRoute } from "astro";
import { CSRF_COOKIE, isSameOriginRequest, validateCsrfToken } from "../../../lib/auth";
import { recordAuthAudit } from "../../../lib/auth/audit";
import { consumeEmailVerificationToken } from "../../../lib/email-verification";

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const form = await request.formData();
  const nonce = cookies.get(CSRF_COOKIE)?.value;

  if (!isSameOriginRequest(request) || !await validateCsrfToken("verify-email", nonce, form.get("csrfToken"))) {
    await recordAuthAudit(request, {
      userId: locals.user?.id ?? null,
      eventType: "email_verified",
      outcome: "blocked",
      metadata: { reason: "request_validation" },
    });
    return Response.redirect(new URL("/verify-email?error=request", request.url), 303);
  }

  try {
    const verified = await consumeEmailVerificationToken(form.get("token"));
    if (!verified) {
      await recordAuthAudit(request, {
        userId: locals.user?.id ?? null,
        eventType: "email_verified",
        outcome: "failure",
        metadata: { reason: "invalid_or_expired_token" },
      });
      return Response.redirect(new URL("/verify-email?error=invalid", request.url), 303);
    }

    await recordAuthAudit(request, {
      userId: locals.user?.id ?? null,
      eventType: "email_verified",
      outcome: "success",
    });
    return Response.redirect(new URL(locals.user ? "/account?verified=1" : "/login?verified=1", request.url), 303);
  } catch (error) {
    console.error("Email verification failed unexpectedly.", error);
    await recordAuthAudit(request, {
      userId: locals.user?.id ?? null,
      eventType: "email_verified",
      outcome: "failure",
      metadata: { reason: "internal" },
    });
    return Response.redirect(new URL("/verify-email?error=unavailable", request.url), 303);
  }
};
