import type { APIRoute } from "astro";
import {
  AuthServiceError,
  CSRF_COOKIE,
  consumeRateLimit,
  createSession,
  getSessionCookieName,
  getSessionCookieOptions,
  isSameOriginRequest,
  registerUser,
  safeNextPath,
  validateCsrfToken,
  verifyTurnstile,
} from "../../../lib/auth";

function registerRedirect(request: Request, error: string, next: string): Response {
  const url = new URL("/register", request.url);
  url.searchParams.set("error", error);
  if (next !== "/account") url.searchParams.set("next", next);
  return Response.redirect(url, 303);
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const form = await request.formData();
  const next = safeNextPath(form.get("next"));

  if (!isSameOriginRequest(request)) return registerRedirect(request, "request", next);

  const csrfNonce = cookies.get(CSRF_COOKIE)?.value;
  if (!await validateCsrfToken("register", csrfNonce, form.get("csrfToken"))) {
    return registerRedirect(request, "request", next);
  }

  const email = form.get("email");
  const allowed = await consumeRateLimit(request, "register", String(email ?? ""), 5, 60 * 60);
  if (!allowed) return registerRedirect(request, "rate", next);

  try {
    const turnstileValid = await verifyTurnstile(request, form.get("cf-turnstile-response"), "register");
    if (!turnstileValid) return registerRedirect(request, "challenge", next);

    const user = await registerUser({
      email,
      displayName: form.get("displayName"),
      password: form.get("password"),
    });
    const { token } = await createSession(user);
    cookies.set(getSessionCookieName(request), token, getSessionCookieOptions(request));
    return Response.redirect(new URL(next, request.url), 303);
  } catch (error) {
    if (error instanceof AuthServiceError) {
      if (error.code === "duplicate") return registerRedirect(request, "duplicate", next);
      if (error.code === "invalid") return registerRedirect(request, "invalid", next);
      if (error.code === "unavailable") return registerRedirect(request, "unavailable", next);
    }
    console.error("Registration failed unexpectedly.", error);
    return registerRedirect(request, "unavailable", next);
  }
};
