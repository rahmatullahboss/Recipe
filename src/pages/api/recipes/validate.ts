import type { APIRoute } from "astro";
import { validateRecipeDraft } from "../../../lib/recipe-draft";

const MAX_BODY_BYTES = 100_000;

export const POST: APIRoute = async ({ request }) => {
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json(
      { valid: false, errors: [{ path: "request", message: "Draft payload is too large." }], draft: null },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json(
      { valid: false, errors: [{ path: "request", message: "Send the draft as application/json." }], draft: null },
      { status: 415, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const payload = await request.json();
    const result = validateRecipeDraft(payload);
    return Response.json(result, {
      status: result.valid ? 200 : 422,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { valid: false, errors: [{ path: "request", message: "The JSON payload could not be read." }], draft: null },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
};
