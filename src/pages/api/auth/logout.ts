import type { APIRoute } from "astro";
import {
  CSRF_COOKIE,
  destroySession,
  getSessionCookieName,
  getSessionCookieOptions,
  isSameOriginRequest,
  validateCsrfToken,
} from "../../../lib/auth";

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const form = await request.formData();
  const csrfNonce = cookies.get(CSRF_COOKIE)?.value;

  if (
    !isSameOriginRequest(request)
    || !locals.session
    || !await validateCsrfToken("logout", csrfNonce, form.get("csrfToken"))
    || form.get("sessionCsrf") !== locals.session.csrfToken
  ) {
    return new Response("Invalid logout request.", { status: 403 });
  }

  await destroySession(locals.session);
  const options = getSessionCookieOptions(request);
  cookies.delete(getSessionCookieName(request), { path: options.path });
  return Response.redirect(new URL("/", request.url), 303);
};
