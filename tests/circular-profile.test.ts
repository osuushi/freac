import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";
import { featureEdges } from "../src/model/feature-edges.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

test("complete circles stay periodic on every coordinate plane in both extrusion directions", async () => {
  for (const plane of Object.values(planes))
    for (const distance of [-5, 5]) {
      const sketch: Sketch = {
        ...emptySketch({ ...plane, origin: [11, -7, 13] }),
        curves: [
          { id: "circle", kind: "circle", center: { x: 2, y: 3 }, radius: 4, construction: false },
        ],
      };
      await extrude(sketch, distance, (body) => {
        assert.equal(body.faces.length, 3);
        assert.equal(body.edges.length, 3, "Two closed rims plus one retained native seam");
        assert.equal(featureEdges(body).length, 2);
        assert.ok(featureEdges(body).every((e) => e.curve?.kind === "circle"));
        assert.ok(Math.abs(body.volume - 80 * Math.PI) < 1e-7);
      });
    }
});

test("circle cut by a chord makes one exact major or minor arc wall, not half-circle fragments", async () => {
  const sketch: Sketch = {
    ...emptySketch(planes.XY),
    curves: [
      { id: "circle", kind: "circle", center: { x: 0, y: 0 }, radius: 5, construction: false },
      { id: "chord", kind: "segment", a: { x: 3, y: -4 }, b: { x: 3, y: 4 }, construction: false },
    ],
  };
  const smallArea = 25 * Math.acos(3 / 5) - 12;
  const regions = profilesFor(sketch);
  assert.equal(regions.length, 2);
  for (const profile of regions) {
    await extrude(
      sketch,
      2,
      (body) => {
        assert.equal(body.faces.length, 4, "Two caps, one planar wall, one curved wall");
        assert.equal(body.edges.filter((e) => e.curve?.kind === "arc").length, 2);
        const area = profile.area < (25 * Math.PI) / 2 ? smallArea : 25 * Math.PI - smallArea;
        assert.ok(Math.abs(body.volume - 2 * area) < 1e-7);
      },
      profile.key,
    );
  }
});

async function extrude(
  sketch: Sketch,
  distance: number,
  check: (body: Body) => void,
  profile = profilesFor(sketch)[0].key,
) {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    assert.equal(
      (
        await owner.call({
          kind: "extrude",
          extrusion: { sources: [{ sketch: sketch.id, profile }], distance, mode: "new" },
        })
      ).error,
      undefined,
    );
    await owner.call({ kind: "accept" });
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    check(body);
  } finally {
    owner.close();
  }
}
