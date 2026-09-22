import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { nativeFlags, prepareHeaders } from "./native-inputs.mjs";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, ".cache/solver/source");
const build = resolve(root, ".build/solver");
const headers = await prepareHeaders();
const commit = "78e4038a564e4c8bfebb40119b41d67531232223";
const manifest = JSON.parse(await readFile(resolve(root, "native/solver/sources.json"), "utf8"));
await mkdir(source, { recursive: true });
for (const [path, hash] of Object.entries(manifest)) {
  const original = resolve(source, `${basename(path)}.upstream`);
  if (!existsSync(original)) {
    const response = await fetch(
      `https://raw.githubusercontent.com/FreeCAD/FreeCAD/${commit}/${path}`,
    );
    if (!response.ok) throw new Error(`Download failed: ${path} (${response.status})`);
    await writeFile(original, Buffer.from(await response.arrayBuffer()));
  }
  const data = await readFile(original);
  if (createHash("sha256").update(data).digest("hex") !== hash)
    throw new Error(`Pinned source hash mismatch: ${path}`);
  // Same narrow host adaptation as the isolated P0 proof; solver mathematics unchanged.
  const adapted =
    "// Freac adaptation (2026-09-22): host includes/export declarations only.\n" +
    data
      .toString()
      .replaceAll("../../SketcherGlobal.h", "SketcherGlobal.h")
      .replace("#include <Base/Tools.h>", '#include "p0_base_compat.h"')
      .replace("#include <Base/Console.h>", "")
      .replace("#include <FCConfig.h>", "");
  const destination = resolve(source, basename(path));
  if (!existsSync(destination) || (await readFile(destination, "utf8")) !== adapted)
    await writeFile(destination, adapted);
}
const exportsHeader = resolve(source, "SketcherGlobal.h");
if (!existsSync(exportsHeader))
  await writeFile(exportsHeader, "#pragma once\n#define SketcherExport\n");
for (const args of [
  [
    "-S",
    resolve(root, "native/solver"),
    "-B",
    build,
    `-DPLANEGCS_SOURCE=${source}`,
    "-DCMAKE_BUILD_TYPE=Release",
    ...headers,
    ...nativeFlags(),
  ],
  ["--build", build, "--config", "Release", "--parallel", "2"],
]) {
  const result = spawnSync("cmake", args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
