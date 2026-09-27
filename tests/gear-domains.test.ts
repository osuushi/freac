import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { gearDefinition } from "../src/decorators/gear-settings.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import type { Body } from "../src/model/body.js";
import { validateMesh } from "../src/model/export-mesh.js";
import { planes } from "../src/sketch/planes.js";
import { retainHalf, roundBody } from "./decorator-domain-fixtures.js";

async function apply(owner: DocumentOwner, body: Body, settings = {}) {
  const faces = body.faces.filter((f) => f.cylinder).map((f) => ({ body: body.id, face: f.id }));
  assert.equal(
    (
      await owner.call({
        kind: "decorator",
        edit: { action: "apply", definition: gearDefinition, faces, settings },
      })
    ).error,
    undefined,
  );
  return faces;
}

test("disconnected cylindrical gear sectors retain flats and one tooth phase", async () => {
  const owner = new DocumentOwner();
  try {
    let body = await roundBody(owner, [10]);
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
    assert.equal(body.faces.filter((f) => f.cylinder).length, 2);
    const faces = await apply(owner, body, { helix: 20, phase: 13 });
    assert.equal(owner.view.data.decorators?.length, 1);
    const instance = owner.view.data.decorators?.[0];
    assert.ok(instance);
    const prepared = await owner.call({ kind: "export-geometry" });
    assert.ok(prepared.exportDocument);
    const mesh = decoratedMeshes(await initializeMeshRuntime(), prepared.exportDocument)[0];
    validateMesh(mesh);
    assert.ok(mesh.vertices.every(([x]) => Math.abs(x) <= 6.00001));
    assert.ok(mesh.vertices.some(([x, y]) => Math.hypot(x, y) > 10.4));
    assert.equal(
      (await owner.call({ kind: "decorator", edit: { action: "remove", faces: [faces[0]] } }))
        .error,
      undefined,
    );
    assert.deepEqual(owner.view.data.decorators?.[0].frame, instance.frame);
    assert.equal(owner.view.data.decorators?.[0].settings.phase, 13);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "continue", id: instance.id, faces: [faces[0]] },
        })
      ).error,
      undefined,
    );
    assert.equal(owner.view.data.decorators?.[0].faces.length, 2);
  } finally {
    owner.close();
  }
});

test("separated axial gear patches preserve the unselected gap", async () => {
  const owner = new DocumentOwner();
  try {
    const original = await roundBody(owner, [10]);
    for (const z of [3, 7]) {
      const faces = owner.view.data.bodies?.[0].faces.filter((f) => f.cylinder).map((f) => f.id);
      assert.equal(
        (
          await owner.call({
            kind: "plane-cut",
            operation: {
              mode: "imprint",
              targets: [{ body: original.id, faces }],
              frame: { ...planes.XY, origin: [0, 0, z] },
            },
          })
        ).error,
        undefined,
      );
      assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    }
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    // Select by triangle extent, independent of face enumeration/signature layout.
    const patches = body.faces.filter(
      (f) =>
        f.cylinder &&
        (f.vertices.every((n, i) => i % 3 !== 2 || n <= 3.000001) ||
          f.vertices.every((n, i) => i % 3 !== 2 || n >= 6.999999)),
    );
    assert.equal(patches.length, 2);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: gearDefinition,
            faces: patches.map((f) => ({ body: body.id, face: f.id })),
            settings: { helix: 25 },
          },
        })
      ).error,
      undefined,
    );
    const prepared = await owner.call({ kind: "export-geometry" });
    assert.ok(prepared.exportDocument);
    const mesh = decoratedMeshes(await initializeMeshRuntime(), prepared.exportDocument)[0];
    validateMesh(mesh);
    assert.ok(
      mesh.vertices
        .filter((p) => p[2] > 3.01 && p[2] < 6.99)
        .every(([x, y]) => Math.abs(Math.hypot(x, y) - 10) < 0.01),
    );
    assert.equal(owner.view.data.decorators?.length, 1);
  } finally {
    owner.close();
  }
});

test("gear copies transport phase and radius edits retain count with agent dimensions", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await roundBody(owner, [10]);
    const refs = await apply(owner, body, { teeth: 40, phase: 13 });
    const instance = owner.view.data.decorators?.[0];
    assert.ok(instance);
    const query = await owner.call({
      kind: "decorator-inspect",
      query: {
        definition: gearDefinition,
        version: 1,
        faces: refs,
        instanceId: instance.id,
        normalModule: 0.6,
      },
    });
    assert.equal(query.decoratorInspection?.requiredPitchRadius, 12);
    assert.equal(query.decoratorInspection?.gearDimensions?.[0].normalModule, 0.5);
    owner.beginScript("resize gear");
    await owner.scripts.step({
      kind: "replaceFace",
      input: {
        body: body.id,
        face: refs[0].face,
        surface: { kind: "cylinder", origin: [0, 0, 0], axis: [0, 0, 1], radius: 12 },
      },
    });
    await owner.scripts.step({
      kind: "editDecorator",
      input: { action: "settings", ids: [instance.id], patch: { helix: 20 } },
    });
    owner.scripts.finish();
    assert.equal(owner.view.data.decorators?.[0].problem, undefined);
    assert.equal(owner.view.data.decorators?.[0].settings.teeth, 40);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data.bodies?.[0].faces.find((f) => f.cylinder)?.cylinder?.radius, 10);
    assert.equal(owner.view.data.decorators?.[0].settings.helix, 0);
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ids: [body.id],
            pivot: [0, 0, 0],
            axis: [1, 0, 0],
            angle: 90,
            translation: [30, 0, 0],
            duplicate: true,
          },
        })
      ).error,
      undefined,
    );
    const copy = owner.view.data.decorators?.[1];
    assert.ok(copy);
    assert.equal(copy.problem, undefined);
    assert.equal(copy.settings.phase, 13);
    assert.deepEqual(copy.frame.origin, [30, 0, 0]);
  } finally {
    owner.close();
  }
});
