import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
    const settings = sdkSettings();
    const script = resolve(sdk, "verify.cmake");
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
    execFileSync("cmake", ["-P", script]);
    // The verification script is test scaffolding, outside the installed inventory.
    await rm(script);
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
