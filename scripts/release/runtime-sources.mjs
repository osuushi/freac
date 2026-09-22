import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// Runtime sources are immutable per Electron version and reused by app releases.
// This runs on Linux, keeping the 6 GB download off the smaller macOS runner.
const manifest = JSON.parse(await readFile("packaging/runtime-sources.json", "utf8"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
if (pkg.devDependencies.electron !== manifest.electronVersion)
  throw new Error("Update runtime source pins with Electron");
const directory = resolve(".build/runtime-sources");
await mkdir(directory, { recursive: true });
const gh = (args) =>
  execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const existing = spawnSync(
  "gh",
  ["release", "view", manifest.releaseTag, "--json", "isDraft,assets"],
  { encoding: "utf8" },
);
if (existing.status === 0 && !JSON.parse(existing.stdout).isDraft) {
  const assets = JSON.parse(existing.stdout).assets;
  const required = [
    "runtime-sources.json",
    "SHA256SUMS",
    "RUNTIME-SOURCES.md",
    "electron-44.3.0.tar.gz",
    ...Array.from(
      { length: 6 },
      (_, i) => `chromium-152.0.7977.78.tar.xz.part-${String(i).padStart(2, "0")}`,
    ),
  ];
  for (const name of required)
    if (!assets.some((asset) => asset.name === name && asset.size > 0))
      throw new Error(`Published runtime source release is incomplete: ${name}`);
  gh([
    "release",
    "download",
    manifest.releaseTag,
    "--pattern",
    "runtime-sources.json",
    "--dir",
    directory,
    "--clobber",
  ]);
  if (
    (await readFile(join(directory, "runtime-sources.json"), "utf8")) !==
    (await readFile("packaging/runtime-sources.json", "utf8"))
  )
    throw new Error("Published runtime source manifest does not match this build");
  console.log(`Reusing ${manifest.releaseTag}`);
} else {
  for (const input of manifest.archives) {
    const path = join(directory, input.name);
    const response = await fetch(input.url);
    if (!response.ok || !response.body) throw new Error(`Download failed: ${input.url}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(path));
    if ((await digest(path)) !== input.sha256)
      throw new Error(`Runtime source checksum mismatch: ${input.name}`);
    if (input.size) {
      execFileSync("split", ["-b", "1000000000", "-d", path, `${path}.part-`]);
      await rm(path);
    }
  }
  await writeFile(
    join(directory, "runtime-sources.json"),
    await readFile("packaging/runtime-sources.json"),
  );
  await writeFile(
    join(directory, "RUNTIME-SOURCES.md"),
    await readFile("packaging/RUNTIME-SOURCES.md"),
  );
  const names = (await readdir(directory)).filter((name) => name !== "SHA256SUMS").sort();
  const checksums = await Promise.all(
    names.map(async (name) => `${await digest(join(directory, name))}  ${name}`),
  );
  await writeFile(join(directory, "SHA256SUMS"), `${checksums.join("\n")}\n`);
  if (existing.status !== 0)
    gh([
      "release",
      "create",
      manifest.releaseTag,
      "--target",
      process.env.GITHUB_SHA,
      "--draft",
      "--prerelease",
      "--title",
      `Electron ${manifest.electronVersion} corresponding sources`,
      "--notes-file",
      "packaging/RUNTIME-SOURCES.md",
    ]);
  gh([
    "release",
    "upload",
    manifest.releaseTag,
    ...names.map((name) => join(directory, name)),
    join(directory, "SHA256SUMS"),
    "--clobber",
  ]);
  gh(["release", "edit", manifest.releaseTag, "--draft=false", "--prerelease", "--latest=false"]);
}
async function digest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
