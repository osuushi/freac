import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { nativeFlags, prepareHeaders } from "./native-inputs.mjs";
import { sdkCacheKey } from "./release/cache-key.mjs";

const root = resolve(import.meta.dirname, "..");
const cache = resolve(root, ".cache/kernel");
const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
const flags = nativeFlags();
const headers = await prepareHeaders();
let sdk = process.env.OCCT_ROOT;
if (!sdk) {
  const commit = "a016080bf6738d6aeae020badee4e888ad1540a5";
  const archive = process.env.OCCT_SOURCE_ARCHIVE ?? resolve(cache, "occt.tar.gz");
  await mkdir(cache, { recursive: true });
  if (!existsSync(archive)) {
    const response = await fetch(
      `https://codeload.github.com/Open-Cascade-SAS/OCCT/tar.gz/${commit}`,
    );
    if (!response.ok) throw new Error(`OCCT download failed: ${response.status}`);
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  }
  const hash = createHash("sha256")
    .update(await readFile(archive))
    .digest("hex");
  if (hash !== "c533f2667b59921bd6bd40ce82e7b9900b0289ccc731af5fdeeba097de80ef0f")
    throw new Error("Pinned OCCT archive checksum mismatch");
  const source = resolve(cache, "source"),
    build = resolve(cache, "build");
  sdk = resolve(cache, "sdk");
  const cacheKey = await sdkCacheKey();
  const cacheMarker = resolve(sdk, ".freac-sdk");
  const cached = existsSync(cacheMarker) && (await readFile(cacheMarker, "utf8")) === cacheKey;
  await mkdir(source, { recursive: true });
  if (!existsSync(resolve(source, "CMakeLists.txt")))
    run("tar", ["-xzf", archive, "-C", source, "--strip-components=1"]);
  // Freac adaptation (2026-09-23): rounded offset joins must fit their shared
  // boundaries at modeling precision. The upstream caller otherwise uses the
  // pipe constructor's independent 1e-4 mm default, regardless of Shell's Tol.
  // Original implementation remains LGPL-2.1 with the OCCT exception; this
  // reproducible modification ships in the matching Freac sources archive.
  const pipeSource = resolve(source, "src/BRepOffset/BRepOffset_MakeOffset.cxx");
  const originalPipe = "BRepOffset_Offset OF(E, EOn1, EOn2, CurOffset, E1f, E1l);";
  const precisePipe =
    "// Freac (2026-09-23): shared-boundary precision for rounded offset joins.\n" +
    "          BRepOffset_Offset OF(E, EOn1, EOn2, CurOffset, E1f, E1l, false, 1e-7);";
  const pipeText = await readFile(pipeSource, "utf8");
  if (!pipeText.includes(precisePipe)) {
    if (pipeText.split(originalPipe).length !== 2)
      throw new Error("Pinned OCCT offset-join source does not match the precision adaptation");
    await writeFile(pipeSource, pipeText.replace(originalPipe, precisePipe));
  }
  if (!cached) {
    run("cmake", [
      "-S",
      source,
      "-B",
      build,
      `-DCMAKE_INSTALL_PREFIX=${sdk}`,
      "-DCMAKE_BUILD_TYPE=Release",
      "-DBUILD_LIBRARY_TYPE=Shared",
      ...flags,
      ...["FoundationClasses", "ModelingData", "ModelingAlgorithms"].map(
        (m) => `-DBUILD_MODULE_${m}=ON`,
      ),
      ...["Visualization", "ApplicationFramework", "DataExchange", "DETools", "Draw"].map(
        (m) => `-DBUILD_MODULE_${m}=OFF`,
      ),
      "-DUSE_TBB=OFF",
      "-DBUILD_USE_PCH=OFF",
    ]);
    run("cmake", [
      "--build",
      build,
      "--config",
      "Release",
      "--parallel",
      process.env.CMAKE_BUILD_PARALLEL_LEVEL ?? "4",
    ]);
    run("cmake", ["--install", build, "--config", "Release"]);
    await writeFile(cacheMarker, cacheKey);
  } else console.log(`Using cached OCCT SDK ${cacheKey}`);
}
const build = resolve(root, ".build/kernel");
run("cmake", [
  "-S",
  resolve(root, "native/kernel"),
  "-B",
  build,
  "-UOpenCASCADE_DIR",
  `-DCMAKE_PREFIX_PATH=${resolve(sdk)}`,
  "-DCMAKE_BUILD_TYPE=Release",
  ...flags,
  ...headers.filter((flag) => flag.startsWith("-DBOOST")),
]);
run("cmake", ["--build", build, "--config", "Release", "--parallel", "4"]);
