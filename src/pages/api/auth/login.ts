import type { APIRoute } from "astro";
import {
  AuthServiceError,
  CSRF_COOKIE,
  authenticateUser,
  consumeRateLimit,
  createSession,
  getSessionCookieName,
  getSessionCookieOptions,
  isSameOriginRequest,
  safeNextPath,
  validateCsrfToken,
  verifyTurnstile,
} from "../../../lib/auth";
import { recordAuthAudit } from "../../../lib/auth/audit";
import { getAuthRuntimeStatus } from "../../../lib/auth/runtime";

function loginRedirect(request: Request, error: string, next: string): Response {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  if (next !== "/account") url.searchParams.set("next", next);
  return Response.redirect(url, 303);
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const form = await request.formData();
  const next = safeNextPath(form.get("next"));
  const readiness = getAuthRuntimeStatus();

  if (!readiness.ready) {
    await recordAuthAudit(request, { eventType: "login_failed", outcome: "blocked", metadata: { reason: "configuration" } });
    return loginRedirect(request, "unavailable", next);
  }

  if (!isSameOriginRequest(request)) {
    await recordAuthAudit(request, { eventType: "login_failed", outcome: "blocked", metadata: { reason: "origin" } });
    return loginRedirect(request, "request", next);
  }

  const csrfNonce = cookies.get(CSRF_COOKIE)?.value;
  if (!await validateCsrfToken("login", csrfNonce, form.get("csrfToken"))) {
    await recordAuthAudit(request, { eventType: "login_failed", outcome: "blocked", metadata: { reason: "csrf" } });
    return loginRedirect(request, "request", next);
  }

  const email = form.get("email");
  const allowed = await consumeRateLimit(request, "login", String(email ?? ""), 10, 15 * 60);
  if (!allowed) {
    await recordAuthAudit(request, { eventType: "login_failed", outcome: "blocked", metadata: { reason: "rate_limit" } });
    return loginRedirect(request, "rate", next);
  }

  try {
    const turnstileValid = await verifyTurnstile(request, form.get("cf-turnstile-response"), "login");
    if (!turnstileValid) {
      await recordAuthAudit(request, { eventType: "login_failed", outcome: "blocked", metadata: { reason: "turnstile" } });
      return loginRedirect(request, "challenge", next);
    }

    const user = await authenticateUser(email, form.get("password"));
    if (!user) {
      await recordAuthAudit(request, { eventType: "login_failed", outcome: "failure", metadata: { reason: "credentials" } });
      return loginRedirect(request, "invalid", next);
    }

    const { token } = await createSession(user);
    cookies.set(getSessionCookieName(request), token, getSessionCookieOptions(request));
    await recordAuthAudit(request, { userId: user.id, eventType: "login_succeeded", outcome: "success" });
    return Response.redirect(new URL(next, request.url), 303);
  } catch (error) {
    if (error instanceof AuthServiceError && error.code === "unavailable") {
      await recordAuthAudit(request, { eventType: "login_failed", outcome: "blocked", metadata: { reason: "configuration" } });
      return loginRedirect(request, "unavailable", next);
    }
    console.error("Login failed unexpectedly.", error);
    await recordAuthAudit(request, { eventType: "login_failed", outcome: "failure", metadata: { reason: "internal" } });
    return loginRedirect(request, "unavailable", next);
  }
};
