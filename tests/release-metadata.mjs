import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { releaseVersion } from "../scripts/release/version.mjs";

test("release names preserve UTC seconds while Apple versions stay numeric", () => {
  const value = releaseVersion("2026-09-22T14:35:12Z");
  assert.equal(value.tag, "20260922T143512Z");
  assert.equal(value.timestamp, "2026-09-22T14:35:12Z");
  assert.equal(value.shortVersion, "2026.9.22");
  assert.equal(value.bundleVersion, "265.14.35");
  assert.equal(value.version, "2026.265.52512");
  assert.equal(releaseVersion("2028-12-31T23:59:59Z").bundleVersion, "366.23.59");
  for (const invalid of [
    "latest",
    "2026-02-30T00:00:00Z",
    "2026-09-22T14:35:12-03:00",
    "2026-09-22T14:35:12.100Z",
  ])
    assert.throws(() => releaseVersion(invalid));
});

test("runtime source and embedded terminal audits match the installed version pins", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const runtime = JSON.parse(await readFile("packaging/runtime-sources.json", "utf8"));
  assert.equal(pkg.devDependencies.electron, runtime.electronVersion);
  assert.equal(
    pkg.dependencies["ghostty-web"],
    "0.4.0",
    "Review embedded terminal notices on upgrade",
  );
  assert.equal(pkg.license, "LGPL-2.1-or-later");
  for (const input of runtime.archives) {
    assert.match(input.sha256, /^[a-f0-9]{64}$/);
    assert.equal(new URL(input.url).protocol, "https:");
  }
});
