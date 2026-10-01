import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "..");
export const recipeInputs = [
  "scripts/occt-recipe.json",
  "scripts/setup-kernel.mjs",
  "scripts/occt-source.mjs",
  "scripts/sdk-provenance.mjs",
  "scripts/native-inputs.mjs",
  "native/kernel/verify-sdk.cmake",
];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
// Finder can create, rewrite or remove these independently of SDK installation.
const finderMetadata = (path) => path.split("/").at(-1) === ".DS_Store";
export async function sdkRecipeHash() {
  let inputs = "";
  for (const path of recipeInputs)
    inputs += `${path}:${digest(await readFile(resolve(root, path)))}\n`;
  return digest(inputs);
}
export function sdkSettings() {
  return {
    system: { darwin: "Darwin", linux: "Linux", win32: "Windows" }[process.platform],
    architecture:
      process.env.CMAKE_OSX_ARCHITECTURES || (process.arch === "x64" ? "x86_64" : process.arch),
    deploymentTarget:
      process.platform === "darwin" ? process.env.MACOSX_DEPLOYMENT_TARGET || "14.0" : "",
  };
}
async function files(sdk, directory = "") {
  const result = [];
  for (const entry of await readdir(resolve(sdk, directory), { withFileTypes: true })) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.name.startsWith(".freac-sdk") || (!entry.isDirectory() && finderMetadata(path)))
      continue;
    if (entry.isDirectory()) result.push(...(await files(sdk, path)));
    else result.push(path);
  }
  return result.sort();
}
/** Written only after installing the checksum-pinned, adapted source build. */
export async function recordSdk(sdk, buildKey, adaptedSourceHash) {
  let manifest = "";
  for (const path of await files(sdk))
    manifest += `${digest(await readFile(resolve(sdk, path)))}\t${path}\n`;
  const receipt = {
    schema: 1,
    recipe: await sdkRecipeHash(),
    settings: sdkSettings(),
    buildKey,
    adaptedSourceHash,
    filesHash: digest(manifest),
  };
  await writeFile(resolve(sdk, ".freac-sdk-files"), manifest);
  await writeFile(resolve(sdk, ".freac-sdk.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  await writeFile(resolve(sdk, ".freac-sdk"), buildKey);
}
export async function verifySdk(sdk) {
  let receipt;
  try {
    receipt = JSON.parse(await readFile(resolve(sdk, ".freac-sdk.json"), "utf8"));
  } catch {
    throw new Error(
      `OCCT_ROOT requires an adapted Freac SDK receipt: ${sdk}. Run setup:kernel without OCCT_ROOT to build one.`,
    );
  }
  if (receipt.schema !== 1 || receipt.recipe !== (await sdkRecipeHash()))
    throw new Error(
      "OCCT SDK recipe does not match this Freac checkout; rebuild with setup:kernel",
    );
  if (JSON.stringify(receipt.settings) !== JSON.stringify(sdkSettings()))
    throw new Error(
      "OCCT SDK platform, architecture or deployment target does not match the calculator",
    );
  const paths = await files(sdk);
  const manifest = await readFile(resolve(sdk, ".freac-sdk-files"), "utf8");
  if (digest(manifest) !== receipt.filesHash)
    throw new Error("OCCT SDK file manifest differs from its build receipt");
  const hashes = new Map(
    manifest
      .trimEnd()
      .split("\n")
      .map((line) => {
        const [hash, path] = line.split("\t");
        if (
          !/^[a-f0-9]{64}$/.test(hash) ||
          !path ||
          path.startsWith("/") ||
          path.split("/").includes("..")
        )
          throw new Error("Invalid OCCT SDK receipt file");
        return [path, hash];
      })
      // Older receipts may have recorded Finder metadata; its bytes are not SDK payload.
      .filter(([path]) => !finderMetadata(path)),
  );
  if (JSON.stringify(paths) !== JSON.stringify([...hashes.keys()].sort()))
    throw new Error("OCCT SDK installed file inventory differs from its build receipt");
  for (const path of paths)
    if (digest(await readFile(resolve(sdk, path))) !== hashes.get(path))
      throw new Error(`OCCT SDK file differs from its build receipt: ${path}`);
  return receipt;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await verifySdk(resolve(process.argv[2]));
  console.log("Verified adapted Freac OCCT SDK");
}
