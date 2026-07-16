// Registers the extensionless-TS resolve hook for `node --test`.
import { register } from "node:module";
register("./test-resolver.mjs", import.meta.url);
