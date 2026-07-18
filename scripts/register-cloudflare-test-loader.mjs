import { register } from "node:module";

const routeAcceptance = process.env.OZZYL_TEST_LOADER === "worker-route"
  || process.argv.some((value) => value.endsWith("test-recipe-change-set-rebase-route.mjs"));
const loader = routeAcceptance
  ? "./worker-route-test-loader.mjs"
  : "./cloudflare-test-loader.mjs";

register(loader, import.meta.url);
