import { register } from "node:module";

const loader = process.env.OZZYL_TEST_LOADER === "worker-route"
  ? "./worker-route-test-loader.mjs"
  : "./cloudflare-test-loader.mjs";

register(loader, import.meta.url);
