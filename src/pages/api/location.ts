import type { APIRoute } from "astro";
import { isSupportedMarket, normaliseMarketCode } from "../../lib/market";

export const POST: APIRoute = async ({ request, cookies }) => {
  const form = await request.formData();
  const country = normaliseMarketCode(String(form.get("country") ?? ""));
  const requestedReturnTo = String(form.get("returnTo") ?? "/");
  const returnTo = requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//") ? requestedReturnTo : "/";

  if (!country || !isSupportedMarket(country)) {
    return new Response("Unsupported market", { status: 400 });
  }

  cookies.set("preferred_country", country, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    maxAge: 60 * 60 * 24 * 365,
  });

  return new Response(null, {
    status: 303,
    headers: { Location: returnTo },
  });
};
