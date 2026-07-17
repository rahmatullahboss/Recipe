import type { APIRoute } from "astro";
import { CSRF_COOKIE, isSameOriginRequest, validateCsrfToken } from "../../../lib/auth";
import { consumeEmailVerificationToken } from "../../../lib/email-verification";

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const form = await request.formData();
  const nonce = cookies.get(CSRF_COOKIE)?.value;

  if (!isSameOriginRequest(request) || !await validateCsrfToken("verify-email", nonce, form.get("csrfToken"))) {
    return Response.redirect(new URL("/verify-email?error=request", request.url), 303);
  }

  try {
    const verified = await consumeEmailVerificationToken(form.get("token"));
    if (!verified) return Response.redirect(new URL("/verify-email?error=invalid", request.url), 303);
    return Response.redirect(new URL(locals.user ? "/account?verified=1" : "/login?verified=1", request.url), 303);
  } catch (error) {
    console.error("Email verification failed unexpectedly.", error);
    return Response.redirect(new URL("/verify-email?error=unavailable", request.url), 303);
  }
};
