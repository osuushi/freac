import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { threadDefinition, threadSettings } from "../src/decorators/thread-settings.js";
import { roundBody } from "./decorator-domain-fixtures.js";

test("FDM clearance removes hole material without enlarging the rod", async () => {
  const runtime = await initializeMeshRuntime();
  const owner = new DocumentOwner();
  try {
    const bodies = [await roundBody(owner, [5], 10), await roundBody(owner, [8, 5], 10)];
    const refs = bodies.flatMap((body) =>
      body.faces
        .filter((face) => Math.abs((face.cylinder?.radius ?? 0) - 5) < 1e-7)
        .map((face) => ({ body: body.id, face: face.id })),
    );
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "apply", definition: threadDefinition, faces: refs },
        })
      ).error,
      undefined,
    );
    const snapshot = (await owner.call({ kind: "export-geometry" })).exportDocument;
    assert.ok(snapshot);
    const cleared = decoratedMeshes(runtime, snapshot);
    const ids = (owner.view.data.decorators ?? []).map((d) => d.id);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "settings", ids, patch: { clearance: 0 } },
        })
      ).error,
      undefined,
    );
    const zeroSnapshot = (await owner.call({ kind: "export-geometry" })).exportDocument;
    assert.ok(zeroSnapshot);
    const zero = decoratedMeshes(runtime, zeroSnapshot);
    const makeSolid = (mesh: (typeof cleared)[number]) =>
      new runtime.Manifold(
        new runtime.Mesh({
          numProp: 3,
          vertProperties: new Float32Array(mesh.vertices.flat()),
          triVerts: new Uint32Array(mesh.triangles.flat()),
        }),
      );
    const solids = cleared.map(makeSolid),
      zeroSolids = zero.map(makeSolid);
    const pitch = threadSettings((owner.view.data.decorators ?? [])[0].settings).pitch;
    try {
      assert.ok(
        zeroSolids[1].volume() - solids[1].volume() > 1,
        "positive clearance must remove material from the threaded hole",
      );
      assert.ok(
        Math.abs(zeroSolids[0].volume() - solids[0].volume()) < 0.02,
        "hole-side clearance must leave the rod's volume effectively unchanged",
      );
      for (const fraction of [0, 0.25, 0.5, 0.75]) {
        const rotated = solids[0].rotate([0, 0, 360 * fraction]);
        const moved = rotated.translate([0, 0, pitch * fraction]);
        const collision = moved.intersect(solids[1]);
        try {
          assert.ok(
            collision.volume() < 1e-6,
            `threaded solids must remain clear through screw phase ${fraction}`,
          );
        } finally {
          collision.delete();
          moved.delete();
          rotated.delete();
        }
      }
    } finally {
      for (const solid of [...solids, ...zeroSolids]) solid.delete();
    }
  } finally {
    owner.close();
  }
});
