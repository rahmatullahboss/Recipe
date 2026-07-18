import { extname } from "node:path";

const ENV_STUB = new URL("./worker-route-env-stub.mjs", import.meta.url).href;
const CONFLICT_STUB = new URL("./worker-route-conflict-stub.mjs", import.meta.url).href;
const SUBMISSION_STUB = new URL("./worker-route-recipe-submissions-stub.mjs", import.meta.url).href;

function withoutTypeScriptExtension(specifier) {
  return specifier.endsWith(".ts") ? specifier.slice(0, -3) : specifier;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: ENV_STUB, shortCircuit: true };
  }

  const normalized = withoutTypeScriptExtension(specifier);
  if (normalized.endsWith("/recipe-change-set-conflicts")) {
    return { url: CONFLICT_STUB, shortCircuit: true };
  }
  if (normalized.endsWith("/recipe-submissions")) {
    return { url: SUBMISSION_STUB, shortCircuit: true };
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
