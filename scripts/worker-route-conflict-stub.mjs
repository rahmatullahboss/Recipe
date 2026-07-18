import { RecipeSubmissionError } from "./worker-route-recipe-submissions-stub.mjs";

let behavior = {
  kind: "success",
  result: {
    id: "recipe_change_11111111-1111-4111-8111-111111111111",
    status: "draft",
    revision: 3,
    baseRecipeRevision: 7,
    baseContentRevision: 6,
    summary: {
      unchanged: 8,
      proposalOnly: 2,
      liveOnly: 1,
      sameChange: 1,
      conflicts: 2,
    },
  },
};
let lastInput = null;

export function resetRebaseRouteStub() {
  behavior = {
    kind: "success",
    result: {
      id: "recipe_change_11111111-1111-4111-8111-111111111111",
      status: "draft",
      revision: 3,
      baseRecipeRevision: 7,
      baseContentRevision: 6,
      summary: {
        unchanged: 8,
        proposalOnly: 2,
        liveOnly: 1,
        sameChange: 1,
        conflicts: 2,
      },
    },
  };
  lastInput = null;
}

export function configureRebaseRouteStub(next) {
  behavior = structuredClone(next);
  lastInput = null;
}

export function lastRebaseRouteInput() {
  return lastInput ? structuredClone(lastInput) : null;
}

export async function rebaseRecipeChangeSet(input) {
  lastInput = structuredClone(input);
  if (behavior.kind === "service_error") {
    throw new RecipeSubmissionError(behavior.code, behavior.message);
  }
  if (behavior.kind === "error") {
    throw new Error(behavior.message || "Synthetic route acceptance failure.");
  }
  return structuredClone(behavior.result);
}
