import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Face } from "../src/model/body.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { roundedFixture } from "./body-blend-fixtures.js";
import { finish, lift } from "./body-edge-fixtures.js";

for (const type of ["convex", "concave", "rim", "corner"] as const)
  test(`existing ${type} fillet resizes on current geometry with fixed supports and one Undo`, async () => {
    const owner = new DocumentOwner();
    try {
      await roundedFixture(owner, type);
      const before = owner.view.data,
        rounded = before.bodies?.[0];
      assert.ok(rounded);
      const face = rounded.faces.find(
        (f) => f.blend && (type !== "corner" || f.signature[0] === 3),
      );
      assert.ok(face?.blend);
      assert.equal(face.blend.radius, 2);
      assert.equal(face.blend.faces.length, type === "corner" ? 4 : 1);
      const request = {
        kind: "offset-faces" as const,
        operation: { faces: [{ body: rounded.id, face: face.id }], distance: 0, radius: 3 },
      };
      const reply = await owner.call(request);
      assert.equal(reply.error, undefined);
      const after = reply.view.candidate?.bodies?.[0];
      assert.ok(after);
      assert.equal(reply.view.data, before);
      assert.ok(
        face.blend.outward * (after.volume - rounded.volume) < 0,
        "Radius growth has the right material sign",
      );
      if (type === "convex" || type === "concave") {
        const expected =
          (type === "convex" ? 4000 : 3000) + (type === "convex" ? -1 : 1) * 90 * (1 - Math.PI / 4);
        assert.ok(Math.abs(after.volume - expected) < 1e-6);
      }
      for (const support of rounded.faces.filter((f) => !f.blend)) {
        const next: Face | undefined = after.faces.find((f) => f.id === support.id);
        assert.ok(next, "Unambiguous support identity continues");
        assert.deepEqual(next.plane, support.plane);
        assert.deepEqual(next.cylinder, support.cylinder);
      }
      const resized = after.faces.filter((f) => f.blend);
      assert.equal(resized.length, type === "corner" ? 4 : 1);
      for (const f of resized) assert.ok(Math.abs((f.blend?.radius ?? 0) - 3) < 1e-7);
      await owner.call({ kind: "accept" });
      const accepted = owner.view.data;
      await owner.call({ kind: "undo" });
      assert.equal(owner.view.data, before);
      await owner.call({ kind: "redo" });
      assert.equal(owner.view.data, accepted);
      assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
      const opened = owner.view.data.bodies?.[0];
      assert.ok(opened);
      const target = opened.faces.find((f) => f.blend);
      assert.ok(target);
      const invalid = await owner.call({
        ...request,
        operation: {
          ...request.operation,
          faces: [{ body: opened.id, face: target.id }],
          radius: -1,
        },
      });
      assert.ok(invalid.error);
      assert.equal(invalid.view.candidate, null);
      const again = await owner.call({
        ...request,
        operation: {
          ...request.operation,
          faces: [{ body: opened.id, face: target.id }],
          radius: 2.5,
        },
      });
      assert.equal(again.error, undefined);
    } finally {
      owner.close();
    }
  });

test("round-edge chamfer faces expose an oriented handle and offset in both material directions", async () => {
  const owner = new DocumentOwner();
  try {
    const cylinder = await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [
        { id: "circle", kind: "circle", center: { x: 0, y: 0 }, radius: 8, construction: false },
      ],
    });
    const edge = cylinder.edges.find((e) => e.curve?.kind === "circle" && e.points[2] > 9);
    assert.ok(edge);
    await finish(owner, cylinder, [edge], 2, "chamfer");
    await owner.call({ kind: "accept" });
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    const cone = body.faces.find((f) => !f.plane && !f.cylinder);
    assert.ok(cone?.offsetHandle);
    assert.equal(cone.blend, null);
    for (const distance of [-0.5, 0.5]) {
      const reply = await owner.call({
        kind: "offset-faces",
        operation: { faces: [{ body: body.id, face: cone.id }], distance },
      });
      assert.equal(reply.error, undefined);
      const after = reply.view.candidate?.bodies?.[0];
      assert.ok(after);
      assert.ok((after.volume - body.volume) * distance > 0);
      assert.deepEqual(after.bounds, body.bounds, "Cylinder and planar supports stay fixed");
    }
  } finally {
    owner.close();
  }
});
