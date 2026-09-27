import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { gearDefinition } from "../src/decorators/gear-settings.js";
import { inspectGear } from "../src/decorators/gear-support.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { validateMesh } from "../src/model/export-mesh.js";
import { planes } from "../src/sketch/planes.js";
import { retainHalf, roundBody } from "./decorator-domain-fixtures.js";

test("partial bevel faces share one cone and retain the saved reference section", async () => {
  const owner = new DocumentOwner();
  try {
    let body = await roundBody(owner, [10]);
    const originalFace = body.faces.find((f) => f.cylinder);
    assert.ok(originalFace);
    owner.beginScript("cone");
    await owner.scripts.step({
      kind: "replaceFace",
      input: {
        body: body.id,
        face: originalFace.id,
        surface: { kind: "cone", origin: [0, 0, 0], axis: [0, 0, 1], radius: 10, semiAngle: 30 },
      },
    });
    owner.scripts.finish();
    body = owner.view.data.bodies?.[0] as typeof body;
    body = await retainHalf(
      owner,
      body,
      { ...planes.YZ, origin: [6, 0, 0] },
      (b) => b.center[0] < 6,
    );
    body = await retainHalf(
      owner,
      body,
      { ...planes.YZ, origin: [-6, 0, 0] },
      (b) => b.center[0] > -6,
    );
    const faces = body.faces.filter((f) => f.cone).map((f) => ({ body: body.id, face: f.id }));
    assert.equal(faces.length, 2);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "apply", definition: gearDefinition, faces },
        })
      ).error,
      undefined,
    );
    const instance = owner.view.data.decorators?.[0];
    assert.ok(instance);
    assert.equal(owner.view.data.decorators?.length, 1);
    const dimensions = inspectGear(owner.view.data, instance);
    const prepared = await owner.call({ kind: "export-geometry" });
    assert.ok(prepared.exportDocument);
    const mesh = decoratedMeshes(await initializeMeshRuntime(), prepared.exportDocument)[0];
    validateMesh(mesh);
    assert.ok(mesh.vertices.every(([x]) => Math.abs(x) <= 6.00001));
    assert.equal(
      (await owner.call({ kind: "decorator", edit: { action: "remove", faces: [faces[0]] } }))
        .error,
      undefined,
    );
    const remaining = owner.view.data.decorators?.[0];
    assert.ok(remaining);
    assert.equal(inspectGear(owner.view.data, remaining).normalModule, dimensions.normalModule);
    assert.deepEqual(remaining.axialReference, instance.axialReference);
  } finally {
    owner.close();
  }
});

test("internal conic pitch surface retains its material side and exports teeth", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await roundBody(owner, [20, 10]);
    const face = body.faces.find((f) => f.cylinder?.outward === -1);
    assert.ok(face);
    owner.beginScript("inner cone");
    await owner.scripts.step({
      kind: "replaceFace",
      input: {
        body: body.id,
        face: face.id,
        surface: { kind: "cone", origin: [0, 0, 0], axis: [0, 0, 1], radius: 10, semiAngle: 15 },
      },
    });
    owner.scripts.finish();
    assert.equal(
      owner.view.data.bodies?.[0].faces.find((f) => f.id === face.id)?.cone?.outward,
      -1,
    );
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: gearDefinition,
            faces: [{ body: body.id, face: face.id }],
          },
        })
      ).error,
      undefined,
    );
    const prepared = await owner.call({ kind: "export-geometry" });
    assert.ok(prepared.exportDocument);
    validateMesh(decoratedMeshes(await initializeMeshRuntime(), prepared.exportDocument)[0]);
  } finally {
    owner.close();
  }
});
