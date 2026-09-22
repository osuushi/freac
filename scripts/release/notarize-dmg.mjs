import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const { tag } = JSON.parse(await readFile(".build/release/build.json", "utf8"));
const file = resolve(`.build/packages/make/Freac-${tag}-arm64.dmg`);
const run = (command, args, capture = false) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (result.error || result.status !== 0) throw new Error(`${command} failed (${result.status})`);
  return result.stdout;
};
if (process.env.FREAC_SIGN !== "1") throw new Error("DMG notarization requires FREAC_SIGN=1");
run("codesign", ["--force", "--sign", process.env.APPLE_SIGNING_IDENTITY, "--timestamp", file]);
// A temporary keychain profile keeps the password out of the notarytool submit invocation.
run("xcrun", [
  "notarytool",
  "store-credentials",
  "freac-notary",
  "--keychain",
  process.env.APPLE_SIGNING_KEYCHAIN,
  "--apple-id",
  process.env.APPLE_ID,
  "--team-id",
  process.env.APPLE_TEAM_ID,
  "--password",
  process.env.APPLE_APP_SPECIFIC_PASSWORD,
]);
const submission = JSON.parse(
  run(
    "xcrun",
    [
      "notarytool",
      "submit",
      file,
      "--keychain-profile",
      "freac-notary",
      "--keychain",
      process.env.APPLE_SIGNING_KEYCHAIN,
      "--wait",
      "--timeout",
      "30m",
      "--output-format",
      "json",
    ],
    true,
  ),
);
if (submission.status !== "Accepted")
  throw new Error(`Notarization ${submission.id}: ${submission.status}`);
run("xcrun", ["stapler", "staple", file]);
run("xcrun", ["stapler", "validate", file]);
run("spctl", [
  "--assess",
  "--type",
  "open",
  "--context",
  "context:primary-signature",
  "--verbose=2",
  file,
]);
