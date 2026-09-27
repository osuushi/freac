import assert from "node:assert/strict";
import test from "node:test";
import type { Manifold } from "manifold-3d";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { threadDefinition, threadSettings } from "../src/decorators/thread-settings.js";
import { roundBody } from "./decorator-domain-fixtures.js";

function assertOnlyRemovesMaterial(relieved: readonly Manifold[], sharp: readonly Manifold[]) {
  for (const side of [0, 1]) {
    const added = relieved[side].subtract(sharp[side]);
    const removed = sharp[side].subtract(relieved[side]);
    try {
      assert.ok(added.volume() < 0.01, "tip flats must not add material");
      assert.ok(removed.volume() > 0.1, "tip flats must remove material");
    } finally {
      added.delete();
      removed.delete();
    }
  }
}

function assertScrewTravel(rod: Manifold, hole: Manifold, pitch: number) {
  for (const fraction of [0, 0.25, 0.5, 0.75]) {
    const rotated = rod.rotate([0, 0, 360 * fraction]);
    const moved = rotated.translate([0, 0, pitch * fraction]);
    const collision = moved.intersect(hole);
    try {
      assert.ok(collision.volume() < 1e-6, `threads collide at screw phase ${fraction}`);
    } finally {
      collision.delete();
      moved.delete();
      rotated.delete();
    }
  }
}

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
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "settings",
            ids,
            patch: { clearance: 0.25, tipTruncation: 0 },
          },
        })
      ).error,
      undefined,
    );
    const sharpSnapshot = (await owner.call({ kind: "export-geometry" })).exportDocument;
    assert.ok(sharpSnapshot);
    const sharp = decoratedMeshes(runtime, sharpSnapshot);
    const makeSolid = (mesh: (typeof cleared)[number]) =>
      new runtime.Manifold(
        new runtime.Mesh({
          numProp: 3,
          vertProperties: new Float32Array(mesh.vertices.flat()),
          triVerts: new Uint32Array(mesh.triangles.flat()),
        }),
      );
    const solids = cleared.map(makeSolid),
      zeroSolids = zero.map(makeSolid),
      sharpSolids = sharp.map(makeSolid);
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
      assertOnlyRemovesMaterial(solids, sharpSolids);
      assertScrewTravel(solids[0], solids[1], pitch);
    } finally {
      for (const solid of [...solids, ...zeroSolids, ...sharpSolids]) solid.delete();
    }
  } finally {
    owner.close();
  }
});
