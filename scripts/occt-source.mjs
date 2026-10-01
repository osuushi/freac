import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { run } from "./native-inputs.mjs";

export const occtRecipe = JSON.parse(
  await readFile(new URL("./occt-recipe.json", import.meta.url), "utf8"),
);
export async function occtArchive(cache) {
  const archive = process.env.OCCT_SOURCE_ARCHIVE ?? resolve(cache, "occt.tar.gz");
  await mkdir(cache, { recursive: true });
  if (!existsSync(archive)) {
    const response = await fetch(
      `https://codeload.github.com/Open-Cascade-SAS/OCCT/tar.gz/${occtRecipe.commit}`,
    );
    if (!response.ok) throw new Error(`OCCT download failed: ${response.status}`);
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  }
  if (
    createHash("sha256")
      .update(await readFile(archive))
      .digest("hex") !== occtRecipe.sha256
  )
    throw new Error("Pinned OCCT archive checksum mismatch");
  return archive;
}
export async function prepareOcctSource(source, archive) {
  await rm(source, { recursive: true, force: true });
  await mkdir(source, { recursive: true });
  run("tar", ["-xzf", archive, "-C", source, "--strip-components=1"]);
  const { file, original, replacement } = occtRecipe.adaptation;
  const path = resolve(source, file);
  const text = await readFile(path, "utf8");
  if (text.split(original).length !== 2)
    throw new Error("Pinned OCCT offset-join source does not match the precision adaptation");
  // LGPL-2.1 with OCCT exception. The pinned original and reproducible adaptation
  // accompany Freac's matching source archive; no other upstream code changes.
  const adapted = text.replace(original, replacement);
  await writeFile(path, adapted);
  return createHash("sha256").update(adapted).digest("hex");
}
