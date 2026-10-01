import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sdkRecipeHash, sdkSettings } from "../sdk-provenance.mjs";

export async function sdkCacheKey() {
  const compiler = execFileSync(process.env.CXX ?? "c++", ["--version"], { encoding: "utf8" });
  const cmake = execFileSync("cmake", ["--version"], { encoding: "utf8" });
  const sdk =
    process.platform === "darwin"
      ? execFileSync("xcrun", ["--sdk", "macosx", "--show-sdk-version"], { encoding: "utf8" })
      : "";
  const hash = createHash("sha256");
  for (const name of ["../setup-kernel.mjs", "../native-inputs.mjs", "cache-key.mjs"])
    hash.update(await readFile(new URL(name, import.meta.url)));
  hash.update(await sdkRecipeHash());
  hash.update(
    JSON.stringify({
      compiler,
      cmake,
      sdk,
      platform: process.platform,
      arch: process.arch,
      ...sdkSettings(),
    }),
  );
  return hash.digest("hex").slice(0, 24);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(await sdkCacheKey());
