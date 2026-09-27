import assert from "node:assert/strict";
import test from "node:test";
import { queryFaces } from "../src/agent/face-query.js";
import type { SketchResult } from "../src/agent-script/api.js";
import { DocumentOwner } from "../src/backend/document-owner.js";

test("face queries distinguish cylinder radii and visibility without changing geometry/history", async () => {
  const owner = new DocumentOwner();
  try {
    owner.beginScript("cylinders.ts");
    for (const [x, radius] of [
      [0, 2],
      [30, 8],
    ]) {
      const sketch = (await owner.scripts.step({
        kind: "createSketch",
        input: { plane: "XY", curves: [{ kind: "circle", center: { x, y: 0 }, radius }] },
      })) as SketchResult;
      await owner.scripts.step({
        kind: "extrude",
        input: { sources: sketch.profiles, distance: 10, mode: "new" },
      });
    }
    owner.scripts.finish();
    const document = owner.view.data;
    const history = (await owner.call({ kind: "read-history" })).history;
    const bodies = document.bodies ?? [];
    assert.equal(bodies.length, 2);
    const view = { bodiesVisible: true, hidden: [bodies[0].id] };
    const faces = queryFaces(document, view);
    assert.equal(faces.length, 6);
    const cylinders = faces.filter((f) => f.surface === "cylinder");
    assert.deepEqual(
      cylinders.map((f) => f.cylinder.radius),
      [2, 8],
    );
    assert.deepEqual(
      cylinders.map((f) => f.visible),
      [false, true],
    );
    const small = cylinders.filter((f) => f.cylinder.radius < 5);
    assert.equal(small.length, 1);
    assert.equal(small[0].body, bodies[0].id);
    assert.equal(small[0].cylinder.outward, 1);
    assert(faces.filter((f) => f.surface === "plane").every((f) => f.plane && !f.cylinder));
    assert(queryFaces(document, { bodiesVisible: false, hidden: [] }).every((f) => !f.visible));
    assert.equal(owner.view.data, document);
    assert.deepEqual((await owner.call({ kind: "read-history" })).history, history);
  } finally {
    owner.close();
  }
});
