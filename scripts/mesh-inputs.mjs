import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { run } from "./native-inputs.mjs";

export const meshInputCache = resolve(import.meta.dirname, "../.cache/mesh-inputs");
export const meshInputs = {
  manifold: {
    version: "3.5.3",
    commit: "0edd9d54876f3135e431575214dd6d8a72866fee",
    url: "https://codeload.github.com/elalish/manifold/tar.gz/0edd9d54876f3135e431575214dd6d8a72866fee",
    sha256: "67677a21ec39d24c843b4a2be698bf7acba5f9684df667285cef5e5f94c70267",
  },
  tbb: {
    version: "2022.3.0",
    commit: "f1862f38f83568d96e814e469ab61f88336cc595",
    url: "https://codeload.github.com/uxlfoundation/oneTBB/tar.gz/v2022.3.0",
    sha256: "01598a46c1162c27253a0de0236f520fd8ee8166e9ebb84a4243574f88e6e50a",
  },
};
export async function prepareMeshInputs() {
  await mkdir(meshInputCache, { recursive: true });
  for (const [name, input] of Object.entries(meshInputs)) {
    const archive = resolve(meshInputCache, `${name}.tar.gz`);
    const bytes = existsSync(archive)
      ? await readFile(archive)
      : await (async () => {
          const response = await fetch(input.url);
          if (!response.ok) throw new Error(`${name} download failed: ${response.status}`);
          return Buffer.from(await response.arrayBuffer());
        })();
    if (createHash("sha256").update(bytes).digest("hex") !== input.sha256)
      throw new Error(`${name} source checksum mismatch`);
    if (!existsSync(archive)) await writeFile(archive, bytes);
    const directory = resolve(meshInputCache, name),
      marker = resolve(directory, ".freac-source");
    if (existsSync(marker) && (await readFile(marker, "utf8")) === input.sha256) continue;
    if (existsSync(directory))
      throw new Error(`Remove incomplete/stale source directory: ${directory}`);
    await mkdir(directory);
    run("tar", ["-xf", archive, "-C", directory, "--strip-components=1"]);
    await writeFile(marker, input.sha256);
  }
}
