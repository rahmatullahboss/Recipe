import type { APIRoute } from "astro";
import {
  AuthServiceError,
  CSRF_COOKIE,
  consumeRateLimit,
  deletePendingRegistration,
  isSameOriginRequest,
  registerUser,
  safeNextPath,
  validateCsrfToken,
  verifyTurnstile,
} from "../../../lib/auth";
import { recordAuthAudit } from "../../../lib/auth/audit";
import { getAuthRuntimeStatus } from "../../../lib/auth/runtime";
import { deliverEmailVerification } from "../../../lib/email-verification";

function registerRedirect(request: Request, error: string, next: string): Response {
  const url = new URL("/register", request.url);
  url.searchParams.set("error", error);
  if (next !== "/account") url.searchParams.set("next", next);
  return Response.redirect(url, 303);
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const form = await request.formData();
  const next = safeNextPath(form.get("next"));

  if (!getAuthRuntimeStatus().ready) {
    await recordAuthAudit(request, { eventType: "register", outcome: "blocked", metadata: { reason: "runtime_configuration" } });
    return registerRedirect(request, "unavailable", next);
  }

  if (!isSameOriginRequest(request)) {
    await recordAuthAudit(request, { eventType: "register", outcome: "blocked", metadata: { reason: "origin" } });
    return registerRedirect(request, "request", next);
  }

  const csrfNonce = cookies.get(CSRF_COOKIE)?.value;
  if (!await validateCsrfToken("register", csrfNonce, form.get("csrfToken"))) {
    await recordAuthAudit(request, { eventType: "register", outcome: "blocked", metadata: { reason: "csrf" } });
    return registerRedirect(request, "request", next);
  }

  const email = form.get("email");
  const allowed = await consumeRateLimit(request, "register", String(email ?? ""), 5, 60 * 60);
  if (!allowed) {
    await recordAuthAudit(request, { eventType: "register", outcome: "blocked", metadata: { reason: "rate_limit" } });
    return registerRedirect(request, "rate", next);
  }

  let pendingUserId: string | null = null;
  try {
    const turnstileValid = await verifyTurnstile(request, form.get("cf-turnstile-response"), "register");
    if (!turnstileValid) {
      await recordAuthAudit(request, { eventType: "register", outcome: "blocked", metadata: { reason: "turnstile" } });
      return registerRedirect(request, "challenge", next);
    }

    const user = await registerUser({
      email,
      displayName: form.get("displayName"),
      password: form.get("password"),
      termsAccepted: form.get("termsAccepted"),
      policyVersion: form.get("policyVersion"),
    });
    pendingUserId = user.id;

    await deliverEmailVerification(user, request);
    await recordAuthAudit(request, { userId: user.id, eventType: "register", outcome: "success" });

    const verificationPage = new URL("/verify-email", request.url);
    verificationPage.searchParams.set("sent", "1");
    if (next !== "/account") verificationPage.searchParams.set("next", next);
    return Response.redirect(verificationPage, 303);
  } catch (error) {
    if (pendingUserId) {
      await recordAuthAudit(request, { userId: pendingUserId, eventType: "register", outcome: "failure", metadata: { reason: "verification_delivery" } });
      await deletePendingRegistration(pendingUserId);
    }

    if (error instanceof AuthServiceError) {
      if (error.code === "duplicate") {
        await recordAuthAudit(request, { eventType: "register", outcome: "failure", metadata: { reason: "duplicate" } });
        return registerRedirect(request, "duplicate", next);
      }
      if (error.code === "invalid") {
        await recordAuthAudit(request, { eventType: "register", outcome: "failure", metadata: { reason: "validation" } });
        return registerRedirect(request, "invalid", next);
      }
      if (error.code === "unavailable") {
        await recordAuthAudit(request, { eventType: "register", outcome: "blocked", metadata: { reason: "configuration_or_delivery" } });
        return registerRedirect(request, "unavailable", next);
      }
    }
    console.error("Registration failed unexpectedly.", error);
    await recordAuthAudit(request, { eventType: "register", outcome: "failure", metadata: { reason: "internal" } });
    return registerRedirect(request, "unavailable", next);
  }
};
