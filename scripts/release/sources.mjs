import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { inputCache, nativeInputs } from "../native-inputs.mjs";

const metadata = JSON.parse(await readFile(".build/release/build.json", "utf8"));
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (
  metadata.commit !== commit ||
  execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()
)
  throw new Error(
    "Source distribution requires a clean committed tree matching the packaged build",
  );
const stage = resolve(".build/source-stage");
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
const tree = join(stage, "freac");
await mkdir(tree);
const archive = join(stage, "freac.tar");
execFileSync("git", ["archive", "--format=tar", "--output", archive, commit]);
execFileSync("tar", ["-xf", archive, "-C", tree]);
await rm(archive);
await mkdir(join(tree, ".cache/release-inputs"), { recursive: true });
for (const input of Object.values(nativeInputs)) {
  const bytes = await readFile(join(inputCache, input.archive));
  if (createHash("sha256").update(bytes).digest("hex") !== input.sha256)
    throw new Error("Source checksum mismatch");
  await writeFile(join(tree, ".cache/release-inputs", input.archive), bytes);
}
await mkdir(join(tree, ".cache/kernel"), { recursive: true });
await cp(".cache/kernel/occt.tar.gz", join(tree, ".cache/kernel/occt.tar.gz"));
await cp(".cache/solver/source", join(tree, ".cache/solver/source"), { recursive: true });
await cp(".build/release/build.json", join(tree, "RELEASE.json"));
await cp(".build/release/licenses", join(tree, "release-licenses"), { recursive: true });
const assets = resolve(".build/assets");
await mkdir(assets, { recursive: true });
const filename = `Freac-${metadata.tag}-sources.tar.gz`;
execFileSync("tar", ["-czf", join(assets, filename), "-C", stage, "freac"]);
await rm(stage, { recursive: true, force: true });
console.log(`Created ${filename}`);
