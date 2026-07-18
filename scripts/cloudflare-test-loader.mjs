import { extname } from "node:path";

const CLOUDFLARE_WORKERS_STUB = "data:text/javascript,export const env = Object.freeze({});";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return {
      url: CLOUDFLARE_WORKERS_STUB,
      shortCircuit: true,
    };
  }

  if (
    context.parentURL?.startsWith("file:")
    && (specifier.startsWith("./") || specifier.startsWith("../"))
  ) {
    const candidate = new URL(specifier, context.parentURL);
    if (!extname(candidate.pathname)) {
      try {
        return await nextResolve(`${specifier}.ts`, context);
      } catch (error) {
        if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
      }
    }
  }

  return nextResolve(specifier, context);
}
