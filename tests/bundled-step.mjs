import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { NativeSolver } from "../.cache/sketch-tests/src/backend/native-solver.js";
import { exportMesh } from "../.cache/sketch-tests/src/model/export-mesh.js";
import { stepItems } from "../.cache/sketch-tests/src/model/step-export.js";
import { prism, square } from "../.cache/sketch-tests/tests/body-edge-fixtures.js";
import { bundleNative, dependencies } from "../scripts/release/native.mjs";
import { readStep } from "./step-readback.mjs";

assert.equal(process.platform, "darwin", "This checks the macOS native bundle");
const root = await mkdtemp(join(tmpdir(), "makeshift-step-bundle-"));
const native = join(root, "native");
let owner;
try {
  await bundleNative(native, resolve(process.env.OCCT_ROOT ?? ".cache/kernel/sdk"));
  for (const name of await readdir(native)) {
    const path = join(native, name);
    execFileSync("codesign", ["--verify", "--strict", path]);
    for (const dependency of dependencies(path))
      assert.ok(
        dependency.startsWith("@loader_path/") ||
          dependency.startsWith("/usr/lib/") ||
          dependency.startsWith("/System/Library/"),
        `External native dependency: ${dependency}`,
      );
  }
  owner = new DocumentOwner(
    new NativeSolver(join(native, "makeshift-solver")),
    join(native, "makeshift-kernel"),
  );
  const box = await prism(owner, square);
  const offset = await prism(
    owner,
    square.map(([x, y]) => [x + 30, y]),
  );
  const before = structuredClone(owner.view);
  const reply = await owner.call({
    kind: "export-step",
    items: stepItems([box, offset], [undefined, exportMesh(offset)]),
  });
  assert.equal(reply.error, undefined);
  assert.ok(reply.step);
  const path = join(root, "mixed.step");
  await writeFile(path, reply.step);
  const shapes = readStep(path);
  assert.equal(shapes.length, 2);
  assert.equal(shapes[0].valid, true);
  assert.ok(Math.abs(shapes[0].volume - 4000) < 1e-6);
  assert.equal(shapes[1].exactFaces, 0);
  assert.equal(shapes[1].triangles, 12);
  assert.ok(Math.abs(shapes[1].meshVolume - 4000) < 1e-6);
  assert.deepEqual(owner.view, before);
  console.log(
    "macOS: relocated signed STEP bundle exports exact/mesh bodies without external dependencies",
  );
} finally {
  owner?.close();
  await rm(root, { recursive: true, force: true });
}
