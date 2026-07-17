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

function loginRedirect(request: Request, error: string, next: string): Response {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  if (next !== "/account") url.searchParams.set("next", next);
  return Response.redirect(url, 303);
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const form = await request.formData();
  const next = safeNextPath(form.get("next"));

  if (!isSameOriginRequest(request)) return loginRedirect(request, "request", next);

  const csrfNonce = cookies.get(CSRF_COOKIE)?.value;
  if (!await validateCsrfToken("login", csrfNonce, form.get("csrfToken"))) {
    return loginRedirect(request, "request", next);
  }

  const email = form.get("email");
  const allowed = await consumeRateLimit(request, "login", String(email ?? ""), 10, 15 * 60);
  if (!allowed) return loginRedirect(request, "rate", next);

  try {
    const turnstileValid = await verifyTurnstile(request, form.get("cf-turnstile-response"), "login");
    if (!turnstileValid) return loginRedirect(request, "challenge", next);

    const user = await authenticateUser(email, form.get("password"));
    if (!user) return loginRedirect(request, "invalid", next);

    const { token } = await createSession(user);
    cookies.set(getSessionCookieName(request), token, getSessionCookieOptions(request));
    return Response.redirect(new URL(next, request.url), 303);
  } catch (error) {
    if (error instanceof AuthServiceError && error.code === "unavailable") {
      return loginRedirect(request, "unavailable", next);
    }
    console.error("Login failed unexpectedly.", error);
    return loginRedirect(request, "unavailable", next);
  }
};
