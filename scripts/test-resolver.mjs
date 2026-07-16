// Minimal ESM resolve hook so `node --test` can load the app's TypeScript,
// which uses extensionless relative imports (`from "./types"`) as Next/bundler
// resolution allows. Lets us run tests with Node's built-in type stripping —
// no tsx / esbuild dependency tree (which shipped a broken lockfile entry that
// blocked Vercel installs).
import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/i.test(specifier)) {
    const parent = context.parentURL ? dirname(fileURLToPath(context.parentURL)) : process.cwd();
    const asTs = resolvePath(parent, `${specifier}.ts`);
    if (existsSync(asTs)) return nextResolve(pathToFileURL(asTs).href, context);
  }
  return nextResolve(specifier, context);
}
