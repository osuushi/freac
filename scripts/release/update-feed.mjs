import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { releaseVersion } from "./version.mjs";

export function updateFeed(metadata, repository) {
  const identity = releaseVersion(metadata.timestamp);
  if (identity.version !== metadata.version || identity.tag !== metadata.tag)
    throw new Error("Update identity differs from the packaged app");
  if (metadata.architecture !== "arm64" || metadata.minimumMacOS !== "14.0")
    throw new Error("This feed is only for macOS 14 arm64 builds");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("Invalid repository");
  return {
    currentRelease: metadata.version,
    releases: [
      {
        version: metadata.version,
        updateTo: {
          version: metadata.version,
          name: `Freac ${metadata.timestamp}`,
          pub_date: metadata.timestamp,
          notes: "Freac preview release.",
          url: `https://github.com/${repository}/releases/download/${metadata.tag}/Freac-${metadata.tag}-arm64.zip`,
        },
      },
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const assets = process.argv[2] ?? "release-assets";
  const metadata = JSON.parse(await readFile(join(assets, "build.json"), "utf8"));
  const feed = updateFeed(metadata, process.env.GITHUB_REPOSITORY ?? "osuushi/freac");
  const archive = join(assets, `Freac-${metadata.tag}-arm64.zip`);
  if (!(await stat(archive)).size) throw new Error("Empty update archive");
  const target = ".build/update-site/updates/preview/darwin-arm64/RELEASES.json";
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(feed, null, 2)}\n`);
  await writeFile(".build/update-site/.nojekyll", "");
}
