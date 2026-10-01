import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { exportMesh } from "../.cache/sketch-tests/src/model/export-mesh.js";
import { stepItems } from "../.cache/sketch-tests/src/model/step-export.js";
import { emptySketch } from "../.cache/sketch-tests/src/sketch/document.js";
import { planes } from "../.cache/sketch-tests/src/sketch/planes.js";
import { lift, prism, square } from "../.cache/sketch-tests/tests/body-edge-fixtures.js";
import { shell } from "../.cache/sketch-tests/tests/shell-fixtures.js";
import { readStep } from "./step-readback.mjs";
import { close } from "./ui-helpers.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
const owner = new DocumentOwner();
try {
  const stock = await prism(owner, square);
  await shell(owner, stock, -1);
  assert.equal((await owner.call({ kind: "accept" })).error, undefined);
  const hollow = owner.view.data.bodies[0];
  const ring = await lift(owner, {
    ...emptySketch(planes.XY),
    curves: [5, 2].map((radius, i) => ({
      id: `circle-${i}`,
      kind: "circle",
      center: { x: 40, y: -10 },
      radius,
      construction: false,
    })),
  });
  const before = structuredClone(owner.view);
  const history = (await owner.call({ kind: "read-history" })).history;
  const exactPath = await saveStep("cavity-ring", stepItems([hollow, ring]));
  const exact = readStep(exactPath);
  assert.equal(exact.length, 2);
  assert.ok(exact.every((shape) => shape.valid && shape.meshFaces === 0));
  close(exact[0].volume, 4000 - 18 * 18 * 8);
  close(exact[1].volume, Math.PI * (25 - 4) * 10);
  assert.equal(exact[1].cylinders, 2);
  assertBounds(exact[0].bounds, [0, 0, 0, 20, 20, 10]);
  assertBounds(exact[1].bounds, [35, -15, 0, 45, -5, 10]);

  const mesh = exportMesh(hollow);
  const mixedPath = await saveStep(
    "mesh-cavity-ring",
    stepItems([hollow, ring], [mesh, undefined]),
  );
  const mixed = readStep(mixedPath);
  assert.equal(mixed.length, 2);
  assert.equal(mixed[0].exactFaces, 0);
  assert.equal(mixed[0].triangles, mesh.triangles.length);
  close(mixed[0].meshVolume, 4000 - 18 * 18 * 8);
  assertBounds(mixed[0].bounds, [0, 0, 0, 20, 20, 10]);
  assert.equal(mixed[1].cylinders, 2);
  close(mixed[1].volume, Math.PI * (25 - 4) * 10);
  assert.deepEqual(owner.view, before);
  assert.deepEqual((await owner.call({ kind: "read-history" })).history, history);

  const captured = JSON.parse(await readFile("tests/fixtures/filleted-export.json", "utf8"));
  assert.equal(
    (
      await owner.call({
        kind: "open",
        document: { units: "mm", sketches: [], bodies: [captured] },
      })
    ).error,
    undefined,
  );
  const filletedBody = owner.view.data.bodies[0];
  const filletedBefore = structuredClone(owner.view);
  const capturedPath = await saveStep("filleted-exact", stepItems([filletedBody]));
  const filleted = readStep(capturedPath);
  assert.equal(filleted.length, 1);
  assert.equal(filleted[0].valid, true);
  assert.equal(filleted[0].meshFaces, 0);
  assert.ok(Math.abs(filleted[0].volume / filletedBody.volume - 1) < 1e-5);
  assertBounds(filleted[0].bounds, filletedBody.bounds);
  assert.deepEqual(owner.view, filletedBefore);
  console.log(
    "STEP independent readback: curved supports, sealed cavity, exact/mesh mixture, world bounds, filleted fixture and unchanged history pass",
  );
} finally {
  owner.close();
}

async function saveStep(name, items) {
  const reply = await owner.call({ kind: "export-step", items });
  assert.equal(reply.error, undefined);
  assert.ok(reply.step);
  const path = resolve(`.cache/sketch-review/${name}.step`);
  await writeFile(path, reply.step);
  return path;
}

function assertBounds(actual, expected) {
  actual.forEach((value, i) => {
    close(value, expected[i]);
  });
}
