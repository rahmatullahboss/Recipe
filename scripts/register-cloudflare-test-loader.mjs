import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./cloudflare-test-loader.mjs", pathToFileURL(import.meta.url));
