import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

if (process.env.FREAC_SIGN !== "1") throw new Error("Release assets require a signed build");
const metadata = JSON.parse(await readFile(".build/release/build.json", "utf8"));
const runtime = JSON.parse(await readFile("packaging/runtime-sources.json", "utf8"));
const directory = ".build/assets";
const filename = `Freac-${metadata.tag}-arm64.dmg`;
await cp(`.build/packages/make/${filename}`, join(directory, filename));
await cp(".build/release/build.json", join(directory, "build.json"));
await cp("packaging/runtime-sources.json", join(directory, "runtime-sources.json"));
const repo = process.env.GITHUB_REPOSITORY ?? "osuushi/freac";
await writeFile(
  join(directory, "RELEASE-NOTES.md"),
  `Freac ${metadata.timestamp}\n\nApple Silicon · macOS 14 or newer. Signed and notarized with Developer ID.\n\nOpen the DMG and drag Freac to Applications.\n\nCommit: ${metadata.commit}\n\nFreac is licensed under LGPL-2.1-or-later and uses Open CASCADE Technology and FreeCAD PlaneGCS. Offline notices are in Help → Third-party licenses. The matching sources archive contains Freac, OCCT, adapted PlaneGCS, Eigen, Boost and rebuild instructions.\n\n[Electron/Chromium corresponding sources](https://github.com/${repo}/releases/tag/${runtime.releaseTag}) are shared by all builds using this runtime. Keep both source downloads accessible to everyone receiving the app. They are not needed to install or run Freac.\n\nThis is a friends-and-family prerelease. Intel Macs and automatic updates are not included.\n`,
);
const checksums = [];
for (const name of (await readdir(directory)).filter((name) => name !== "SHA256SUMS").sort()) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(join(directory, name))) hash.update(chunk);
  checksums.push(`${hash.digest("hex")}  ${name}`);
}
await writeFile(join(directory, "SHA256SUMS"), `${checksums.join("\n")}\n`);
