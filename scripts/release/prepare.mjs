import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { bundleNative } from "./native.mjs";
import { generateNotices } from "./notices.mjs";
import { releaseVersion } from "./version.mjs";

if (process.platform !== "darwin" || process.arch !== "arm64")
  throw new Error("The macOS release must be built on an Apple Silicon Mac");
const output = resolve(".build/release");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const metadata = {
  ...releaseVersion(process.env.FREAC_RELEASE_TIMESTAMP),
  commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  architecture: "arm64",
  minimumMacOS: "14.0",
};
await writeFile(`${output}/build.json`, `${JSON.stringify(metadata, null, 2)}\n`);
await bundleNative(`${output}/native`, resolve(process.env.OCCT_ROOT ?? ".cache/kernel/sdk"));
await generateNotices(`${output}/licenses`, metadata);
console.log(`Prepared ${metadata.tag}`);
