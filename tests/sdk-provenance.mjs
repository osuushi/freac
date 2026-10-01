import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { recordSdk, sdkSettings, verifySdk } from "../scripts/sdk-provenance.mjs";

test("SDK consumption rejects absent, stale, incompatible and altered build receipts", async () => {
  const sdk = await mkdtemp(resolve(tmpdir(), "freac-sdk-receipt-"));
  try {
    await mkdir(resolve(sdk, "lib"));
    const library = resolve(sdk, "lib/test-library");
    await writeFile(library, "test bytes, not an OCCT build");
    await assert.rejects(verifySdk(sdk), /requires an adapted Freac SDK receipt/);
    await recordSdk(sdk, "test build key", "test source hash");
    assert.equal((await verifySdk(sdk)).buildKey, "test build key");
    await verifyCmake(sdk);
    const settings = sdkSettings();
    const path = resolve(sdk, ".freac-sdk.json");
    const valid = await readFile(path, "utf8");
    const receipt = JSON.parse(valid);
    await writeFile(path, JSON.stringify({ ...receipt, recipe: "stale" }));
    await assert.rejects(verifySdk(sdk), /recipe does not match/);
    await writeFile(
      path,
      JSON.stringify({ ...receipt, settings: { ...settings, architecture: "other" } }),
    );
    await assert.rejects(verifySdk(sdk), /does not match the calculator/);
    await writeFile(path, valid);
    await writeFile(library, "altered bytes");
    await assert.rejects(verifySdk(sdk), /file differs/);
    await writeFile(library, "test bytes, not an OCCT build");
    await writeFile(resolve(sdk, "extra-file"), "unrecorded");
    await assert.rejects(verifySdk(sdk), /inventory differs/);
  } finally {
    await rm(sdk, { recursive: true, force: true });
  }
});

async function verifyCmake(sdk) {
  const directory = await mkdtemp(resolve(tmpdir(), "freac-sdk-cmake-"));
  const settings = sdkSettings();
  const script = resolve(directory, "verify.cmake");
  try {
    await writeFile(
      script,
      `
set(OpenCASCADE_INSTALL_PREFIX "${sdk}")
set(CMAKE_SYSTEM_NAME "${settings.system}")
set(CMAKE_SYSTEM_PROCESSOR "${settings.architecture}")
set(CMAKE_OSX_ARCHITECTURES "${settings.architecture}")
set(CMAKE_OSX_DEPLOYMENT_TARGET "${settings.deploymentTarget}")
${process.platform === "darwin" ? "set(APPLE TRUE)" : ""}
include("${resolve("native/kernel/verify-sdk.cmake")}")
verify_freac_sdk()
`,
    );
    execFileSync("cmake", ["-P", script], { stdio: "pipe" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("Finder metadata never enters SDK receipts or invalidates installed payload", async () => {
  const sdk = await mkdtemp(resolve(tmpdir(), "freac-sdk-finder-"));
  try {
    await mkdir(resolve(sdk, "lib"));
    await writeFile(resolve(sdk, "lib/test-library"), "installed bytes");
    await writeFile(resolve(sdk, ".DS_Store"), "Finder before installation");
    await writeFile(resolve(sdk, "lib/.DS_Store"), "nested Finder metadata");
    await recordSdk(sdk, "test build", "test source");
    assert.doesNotMatch(await readFile(resolve(sdk, ".freac-sdk-files"), "utf8"), /DS_Store/);
    await writeFile(resolve(sdk, ".DS_Store"), "Finder changed metadata");
    await rm(resolve(sdk, "lib/.DS_Store"));
    await mkdir(resolve(sdk, "include/deep"), { recursive: true });
    await writeFile(resolve(sdk, "include/deep/.DS_Store"), "Finder after installation");
    assert.equal((await verifySdk(sdk)).buildKey, "test build");
    await verifyCmake(sdk);
    await writeFile(resolve(sdk, "lib/.DS_Store.backup"), "not Finder metadata");
    await assert.rejects(verifySdk(sdk), /inventory differs/);
  } finally {
    await rm(sdk, { recursive: true, force: true });
  }
});

test("legacy metadata entries can change or disappear while real SDK hashes remain enforced", async () => {
  const sdk = await mkdtemp(resolve(tmpdir(), "freac-sdk-finder-legacy-"));
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  try {
    await mkdir(resolve(sdk, "lib"));
    const library = resolve(sdk, "lib/test-library");
    await writeFile(library, "installed bytes");
    await recordSdk(sdk, "test build", "test source");
    const manifestPath = resolve(sdk, ".freac-sdk-files");
    const receiptPath = resolve(sdk, ".freac-sdk.json");
    const manifest =
      (await readFile(manifestPath, "utf8")) +
      `${digest("old Finder metadata")}\t.DS_Store\n` +
      `${digest("old Finder metadata")}\tlib/.DS_Store\n`;
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    await writeFile(manifestPath, manifest);
    await writeFile(receiptPath, JSON.stringify({ ...receipt, filesHash: digest(manifest) }));
    await writeFile(resolve(sdk, ".DS_Store"), "different metadata");
    await verifySdk(sdk);
    await verifyCmake(sdk);
    await rm(resolve(sdk, ".DS_Store"));
    await verifySdk(sdk);
    await verifyCmake(sdk);
    await writeFile(library, "altered installed bytes");
    await assert.rejects(verifySdk(sdk), /file differs/);
    await assert.rejects(verifyCmake(sdk), /file differs/);
  } finally {
    await rm(sdk, { recursive: true, force: true });
  }
});
