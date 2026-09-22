import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

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
  hash.update(
    JSON.stringify({
      compiler,
      cmake,
      sdk,
      platform: process.platform,
      arch: process.arch,
      target: process.env.MACOSX_DEPLOYMENT_TARGET ?? "",
      architecture: process.env.CMAKE_OSX_ARCHITECTURES ?? "",
    }),
  );
  return hash.digest("hex").slice(0, 24);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(await sdkCacheKey());
