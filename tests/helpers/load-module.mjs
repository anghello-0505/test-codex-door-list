import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);

// Exercise actual routes/helpers with only external boundaries stubbed.
export function loadModule(path, overrides = {}, cache = new Map()) {
  if (cache.has(path)) return cache.get(path);
  const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const result = { exports: {} };
  cache.set(path, result.exports);
  new Function("require", "module", "exports", compiled)((name) => {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (name.startsWith("@/")) return loadModule(`src/${name.slice(2)}.ts`, overrides, cache);
    return require(name);
  }, result, result.exports);
  return result.exports;
}
