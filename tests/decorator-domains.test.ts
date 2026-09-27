import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import { validateMesh } from "../src/model/export-mesh.js";
import { planes, type Vector } from "../src/sketch/planes.js";
import { retainHalf, roundBody, threadedExport } from "./decorator-domain-fixtures.js";

test("thread additions preserve the opposite wall of thin tubes", async () => {
  for (const side of ["external", "internal"] as const) {
    const owner = new DocumentOwner();
    try {
      const body = await roundBody(owner, side === "external" ? [5, 4.5] : [5.3, 5]);
      const mesh = await threadedExport(owner, body, 5, side === "external" ? "hole" : "rod");
      validateMesh(mesh);
      const radii = mesh.vertices.map((p) => Math.hypot(p[0], p[1]));
      if (side === "external") {
        assert.ok(Math.min(...radii) >= 4.496, "Outward threads must not fill the bore");
        assert.ok(Math.max(...radii) > 5.7, "The outer thread must actually be generated");
      } else {
        assert.ok(Math.max(...radii) <= 5.301, "Inward threads must not expand the outer wall");
        assert.ok(Math.min(...radii) < 4.4, "The inner thread must actually be generated");
      }
    } finally {
      owner.close();
    }
  }
});

test("threads on two cylindrical patches retain both flattened sides", async () => {
  const owner = new DocumentOwner();
  try {
    let body = await roundBody(owner);
    body = await retainHalf(
      owner,
      body,
      { ...planes.YZ, origin: [3, 0, 0] },
      (b) => b.center[0] < 3,
    );
    body = await retainHalf(
      owner,
      body,
      { ...planes.YZ, origin: [-3, 0, 0] },
      (b) => b.center[0] > -3,
    );
    assert.equal(body.faces.filter((f) => f.cylinder).length, 2);
    const mesh = await threadedExport(owner, body, 5, "hole");
    validateMesh(mesh);
    for (const p of mesh.vertices)
      assert.ok(Math.abs(p[0]) <= 3.00001, `Thread crossed flat at ${p}`);
    assert.ok(mesh.vertices.some((p) => Math.abs(p[1]) > 5.7));
    assert.equal(owner.view.data.decorators?.length, 1);
  } finally {
    owner.close();
  }
});

test("sloping thread ends do not grow past the original cap plane", async () => {
  const owner = new DocumentOwner();
  try {
    const u = [2 / Math.sqrt(5), 0, -1 / Math.sqrt(5)] as Vector;
    const body = await retainHalf(
      owner,
      await roundBody(owner),
      { origin: [0, 0, 5], u, v: [0, 1, 0] },
      (b) => b.center[2] < 5,
    );
    const mesh = await threadedExport(owner, body, 5, "hole");
    validateMesh(mesh);
    for (const p of mesh.vertices) {
      assert.ok(p[2] + p[0] / 2 <= 5.00001, `Thread crossed sloped cap at ${p}`);
      assert.ok(p[2] >= -1e-5, "Thread crossed the lower cap");
    }
    assert.ok(mesh.vertices.some((p) => Math.hypot(p[0], p[1]) > 5.7));
  } finally {
    owner.close();
  }
});

test("separated selected axial patches leave the intervening cylinder untouched", async () => {
  const owner = new DocumentOwner();
  try {
    const original = await roundBody(owner);
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
      await owner.call({ kind: "accept" });
    }
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    const patches = body.faces.filter(
      (f) => f.cylinder && (f.signature[5] < 3 || f.signature[5] > 7),
    );
    assert.equal(patches.length, 2);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: threadDefinition,
            faces: patches.map((f) => ({ body: body.id, face: f.id })),
            settings: { cut: "hole" },
          },
        })
      ).error,
      undefined,
    );
    assert.equal(owner.view.data.decorators?.length, 1);
    const snapshot = (await owner.call({ kind: "export-geometry" })).exportDocument;
    assert.ok(snapshot);
    const mesh = decoratedMeshes(await initializeMeshRuntime(), snapshot)[0];
    validateMesh(mesh);
    for (const p of mesh.vertices)
      if (p[2] > 3.00001 && p[2] < 6.99999)
        assert.ok(Math.hypot(p[0], p[1]) <= 5.001, "Threads bridged an unselected axial gap");
    for (const side of [0, 1])
      assert.ok(
        mesh.vertices.some(
          (p) => (side === 0 ? p[2] < 3 : p[2] > 7) && Math.hypot(p[0], p[1]) > 5.7,
        ),
      );
  } finally {
    owner.close();
  }
});
