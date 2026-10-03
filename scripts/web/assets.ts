import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/** Stable content URLs let unchanged calculators survive application releases in HTTP caches. */
export function wasmAssets(): Plugin {
  const assets: Record<string, { js: string; wasm: string }> = {};
  return {
    name: "makeshift-wasm-assets",
    buildStart() {
      for (const kind of ["solver", "kernel"]) {
        const entry = { js: "", wasm: "" };
        for (const extension of ["js", "wasm"] as const) {
          const source = readFileSync(
            resolve(`.build/web-${kind}/bin/makeshift-${kind}.${extension}`),
          );
          const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
          const name = `makeshift-${kind}-${hash}.${extension}`;
          this.emitFile({ type: "asset", fileName: `assets/${name}`, source });
          entry[extension] = `./${name}`;
        }
        assets[kind] = entry;
      }
    },
    resolveId(id) {
      if (id === "virtual:wasm-assets") return "\0virtual:wasm-assets";
    },
    load(id) {
      if (id === "\0virtual:wasm-assets") return `export default ${JSON.stringify(assets)}`;
    },
  };
}
