import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const nativeInputs = {
  eigen: {
    version: "5.0.1",
    archive: "eigen.tar.gz",
    url: "https://gitlab.com/libeigen/eigen/-/archive/5.0.1/eigen-5.0.1.tar.gz",
    sha256: "e9c326dc8c05cd1e044c71f30f1b2e34a6161a3b6ecf445d56b53ff1669e3dec",
  },
  boost: {
    version: "1.90.0",
    archive: "boost.tar.bz2",
    url: "https://archives.boost.io/release/1.90.0/source/boost_1_90_0.tar.bz2",
    sha256: "49551aff3b22cbc5c5a9ed3dbc92f0e23ea50a0f7325b0d198b705e8ee3fc305",
  },
};
export const inputCache = resolve(import.meta.dirname, "../.cache/release-inputs");
export function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}
export async function prepareHeaders() {
  await mkdir(inputCache, { recursive: true });
  for (const [name, input] of Object.entries(nativeInputs)) {
    const archive = resolve(inputCache, input.archive);
    if (!existsSync(archive)) {
      const response = await fetch(input.url);
      if (!response.ok) throw new Error(`${name} download failed: ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (createHash("sha256").update(bytes).digest("hex") !== input.sha256)
        throw new Error(`${name} download checksum mismatch`);
      await writeFile(`${archive}.tmp`, bytes);
      await rename(`${archive}.tmp`, archive);
    }
    if (
      createHash("sha256")
        .update(await readFile(archive))
        .digest("hex") !== input.sha256
    )
      throw new Error(`${name} source checksum mismatch`);
    const directory = resolve(inputCache, name);
    const marker = resolve(directory, ".freac-source");
    if (existsSync(marker) && (await readFile(marker, "utf8")) === input.sha256) continue;
    if (existsSync(directory))
      throw new Error(`Remove incomplete/stale source directory: ${directory}`);
    await mkdir(directory);
    run("tar", ["-xf", archive, "-C", directory, "--strip-components=1"]);
    await writeFile(marker, input.sha256);
  }
  return [
    `-DEIGEN_INCLUDE_DIR=${resolve(inputCache, "eigen")}`,
    `-DBOOST_INCLUDE_DIR=${resolve(inputCache, "boost")}`,
  ];
}
export function nativeFlags() {
  return [
    ...(process.env.CMAKE_OSX_ARCHITECTURES
      ? [`-DCMAKE_OSX_ARCHITECTURES=${process.env.CMAKE_OSX_ARCHITECTURES}`]
      : []),
    ...(process.env.MACOSX_DEPLOYMENT_TARGET
      ? [`-DCMAKE_OSX_DEPLOYMENT_TARGET=${process.env.MACOSX_DEPLOYMENT_TARGET}`]
      : []),
    ...(process.env.CMAKE_CXX_COMPILER_LAUNCHER
      ? [`-DCMAKE_CXX_COMPILER_LAUNCHER=${process.env.CMAKE_CXX_COMPILER_LAUNCHER}`]
      : []),
  ];
}
