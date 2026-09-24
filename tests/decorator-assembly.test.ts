import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import { roundBody } from "./decorator-domain-fixtures.js";

test("different-length exported threads permit screw travel in both hands and cut modes", async () => {
  const runtime = await initializeMeshRuntime();
  const owner = new DocumentOwner();
  try {
    const bodies = [await roundBody(owner, [5], 8), await roundBody(owner, [8, 5], 14)];
    const faces = bodies.map((body) => {
      const face = body.faces.find((f) => f.cylinder && Math.abs(f.cylinder.radius - 5) < 1e-7);
      assert.ok(face);
      return { body: body.id, face: face.id };
    });
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: threadDefinition,
            faces,
          },
        })
      ).error,
      undefined,
    );
    for (const hand of ["right", "left"] as const)
      for (const cut of ["rod", "hole"] as const) {
        const ids = (owner.view.data.decorators ?? []).map((d) => d.id);
        assert.equal(
          (
            await owner.call({
              kind: "decorator",
              edit: {
                action: "settings",
                ids,
                patch: { hand, cut },
              },
            })
          ).error,
          undefined,
        );
        const reply = await owner.call({ kind: "export-geometry" });
        assert.equal(reply.error, undefined);
        assert.ok(reply.exportDocument);
        const meshes = decoratedMeshes(runtime, reply.exportDocument);
        const solids = meshes.map(
          (mesh) =>
            new runtime.Manifold(
              new runtime.Mesh({
                numProp: 3,
                vertProperties: new Float32Array(mesh.vertices.flat()),
                triVerts: new Uint32Array(mesh.triangles.flat()),
              }),
            ),
        );
        try {
          for (const travel of [0.375, 1.125, 3]) {
            const rotation = solids[0].rotate([
              0,
              0,
              ((hand === "right" ? 1 : -1) * 360 * travel) / 1.5,
            ]);
            const placed = rotation.translate([0, 0, travel]);
            const collision = placed.intersect(solids[1]);
            try {
              assert.equal(collision.status(), "NoError");
              assert.ok(
                collision.volume() < 1e-6,
                `${hand} ${cut} threads collided after ${travel} mm screw travel`,
              );
            } finally {
              collision.delete();
              placed.delete();
              rotation.delete();
            }
          }
        } finally {
          for (const solid of solids) solid.delete();
        }
      }
  } finally {
    owner.close();
  }
});
