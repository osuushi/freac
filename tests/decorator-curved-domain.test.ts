import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { validateMesh } from "../src/model/export-mesh.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { roundBody, threadedExport } from "./decorator-domain-fixtures.js";

for (const side of ["external", "internal"] as const)
  test(`${side} threads preserve an off-center transverse cylindrical opening`, async () => {
    const owner = new DocumentOwner();
    try {
      const original = await roundBody(owner, side === "external" ? [5] : [8, 5]);
      const sketch = {
        ...emptySketch({ ...planes.YZ, origin: [-10, 4, 5] }),
        curves: [
          {
            id: "bore",
            kind: "circle" as const,
            radius: 3,
            center: { x: 0, y: 0 },
            construction: false,
          },
        ],
      };
      assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
      assert.equal(
        (
          await owner.call({
            kind: "extrude",
            extrusion: {
              sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
              distance: 20,
              mode: "subtract",
              targets: [original.id],
            },
          })
        ).error,
        undefined,
      );
      assert.equal((await owner.call({ kind: "accept" })).error, undefined);
      const body = owner.view.data.bodies?.[0];
      assert.ok(body);
      assert.ok(body.faces.some((f) => f.cylinder?.radius === 3));
      const mesh = await threadedExport(owner, body, 5, side === "external" ? "hole" : "rod");
      validateMesh(mesh);
      assert.ok(
        mesh.vertices.some((p) =>
          side === "external" ? Math.hypot(p[0], p[1]) > 5.7 : Math.hypot(p[0], p[1]) < 4.4,
        ),
      );
      for (const p of mesh.vertices)
        assert.ok(
          Math.hypot(p[1] - 4, p[2] - 5) >= 2.996,
          `Thread intrudes into transverse bore at ${p}`,
        );
    } finally {
      owner.close();
    }
  });
