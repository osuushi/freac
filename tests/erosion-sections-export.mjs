import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { exportMesh } from "../.cache/sketch-tests/src/model/export-mesh.js";
import { stepItems } from "../.cache/sketch-tests/src/model/step-export.js";
import {
  erosionBores,
  lobedErosionSource,
} from "../.cache/sketch-tests/tests/erosion-sections-fixtures.js";
import { readStep } from "./step-readback.mjs";

await mkdir(".cache/erosion-sections", { recursive: true });
for (const name of ["lobed", "bores"]) {
  const owner = new DocumentOwner();
  try {
    if (name === "lobed") await owner.call({ kind: "open", document: lobedErosionSource });
    else await erosionBores(owner);
    const source = owner.view.data.bodies[0];
    const reply = await owner.call({
      kind: "erode",
      operation: { ids: [source.id], thickness: 1, allowance: 0.5, method: "fast" },
    });
    assert.equal(reply.error, undefined);
    await owner.call({ kind: "accept" });
    const cavity = owner.view.data.bodies[1];
    const cut = await owner.call({
      kind: "boolean-bodies",
      operation: { ids: [source.id, cavity.id], mode: "subtract", keepOriginals: false },
    });
    assert.equal(cut.error, undefined);
    const wall = cut.view.candidate.bodies[0];
    for (const [kind, body] of [
      ["interior", cavity],
      ["wall", wall],
    ]) {
      assert(exportMesh(body).triangles.length > body.faces.length);
      const exported = await owner.call({ kind: "export-step", items: stepItems([body]) });
      assert.equal(exported.error, undefined);
      assert.match(exported.step, /B_SPLINE_SURFACE/);
      assert.doesNotMatch(exported.step, /TESSELLATED_SOLID/);
      const path = resolve(`.cache/erosion-sections/${name}-${kind}.step`);
      await writeFile(path, exported.step);
      const [readback] = readStep(path);
      assert(readback.valid);
      assert.equal(readback.exactFaces, body.faces.length);
      assert.equal(readback.meshFaces, 0);
      assert(Math.abs(readback.volume / body.volume - 1) < 1e-6);
    }
    console.log(
      `${name}: closed oriented mesh and independent exact STEP readback passed for interior and final wall`,
    );
  } finally {
    owner.close();
  }
}
