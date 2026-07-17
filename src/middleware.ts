import { defineMiddleware } from "astro:middleware";
import { getAuthContext } from "./lib/auth";
import { getAuthRuntimeStatus } from "./lib/auth/runtime";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self' https://challenges.cloudflare.com",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src https://challenges.cloudflare.com",
  "img-src 'self' data: https://images.unsplash.com",
  "media-src 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self'",
].join("; ");

const privatePaths = new Set([
  "/login",
  "/register",
  "/account",
  "/verify-email",
  "/saved",
  "/meal-plan",
  "/shopping-list",
  "/recipes/new",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/verify-email",
  "/api/recipes/validate",
  "/api/recipes/submissions",
]);

function isPrivatePath(pathname: string): boolean {
  return privatePaths.has(pathname)
    || pathname.startsWith("/account/")
    || pathname.startsWith("/api/media/")
    || pathname.startsWith("/admin/")
    || /^\/api\/recipes\/[^/]+\/editorial\/?$/.test(pathname)
    || /^\/recipes\/[^/]+\/cook\/?$/.test(pathname);
}

export const onRequest = defineMiddleware(async (context, next) => {
  const readiness = getAuthRuntimeStatus();
  context.locals.authReady = readiness.ready;

  try {
    const auth = await getAuthContext(context.request);
    context.locals.user = auth.user;
    context.locals.session = auth.session;
  } catch (error) {
    console.error("Authentication context could not be loaded.", error);
    context.locals.user = null;
    context.locals.session = null;
  }

  const response = await next();
  const headers = new Headers(response.headers);

  headers.set("Content-Security-Policy", contentSecurityPolicy);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-site");
  headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");

  if (context.url.protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  if (isPrivatePath(context.url.pathname)) {
    headers.set("Cache-Control", "private, no-store");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
