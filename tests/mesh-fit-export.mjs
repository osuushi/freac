import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { exportMesh } from "../.cache/sketch-tests/src/model/export-mesh.js";
import { stepItems } from "../.cache/sketch-tests/src/model/step-export.js";
import { sphereFit, torusFit } from "../.cache/sketch-tests/tests/mesh-fit-fixtures.js";
import { readStep } from "./step-readback.mjs";

await mkdir(".cache/mesh-fit-ui", { recursive: true });
for (const [name, input] of [
  ["sphere", sphereFit()],
  ["torus", torusFit()],
]) {
  const owner = new DocumentOwner();
  try {
    owner.beginScript(`${name}.ts`);
    await owner.scripts.step({ kind: "fitMesh", input });
    owner.scripts.finish();
    const before = owner.view.data;
    const body = before.bodies[0];
    const mesh = exportMesh(body);
    assert(mesh.triangles.length > body.faces.length);
    const exported = await owner.call({ kind: "export-step", items: stepItems([body]) });
    assert.equal(exported.error, undefined);
    assert.match(exported.step, /B_SPLINE_SURFACE/);
    assert.doesNotMatch(exported.step, /TESSELLATED_SOLID/);
    const path = resolve(`.cache/mesh-fit-ui/${name}.step`);
    await writeFile(path, exported.step);
    const [readback] = readStep(path);
    assert(readback.valid);
    assert.equal(readback.exactFaces, body.faces.length);
    assert.equal(readback.meshFaces, 0);
    assert(Math.abs(readback.volume / body.volume - 1) < 1e-6);
    assert.equal(owner.view.data, before);
    if (name === "sphere") await drill(owner, body);
    console.log(`PASS ${name}: closed oriented mesh export and independent exact STEP readback`);
  } finally {
    owner.close();
  }
}

async function drill(owner, body) {
  owner.beginScript("drill-freeform.ts");
  const sketch = await owner.scripts.step({
    kind: "createSketch",
    input: { plane: "XY", curves: [{ kind: "circle", center: { x: 0, y: 0 }, radius: 3 }] },
  });
  await owner.scripts.step({
    kind: "extrude",
    input: {
      sources: sketch.profiles,
      distance: 25,
      symmetric: true,
      mode: "subtract",
      targets: [body.id],
    },
  });
  owner.scripts.finish();
  const drilled = owner.view.data.bodies[0];
  const analytic = ((4 * Math.PI) / 3) * (100 - 9) ** 1.5;
  assert(Math.abs(drilled.volume / analytic - 1) < 0.035);
  exportMesh(drilled);
  await owner.call({ kind: "undo" });
  assert.equal(owner.view.data.bodies[0].brep, body.brep);
  console.log("PASS fitted freeform Boolean: cylindrical through-hole, analytic volume and Undo");
}
