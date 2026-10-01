import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { bezierAt } from "../src/sketch/bezier-geometry.js";
import type { Sketch, SketchDocument } from "../src/sketch/document.js";
import { planeNormal } from "../src/sketch/planes.js";
import { profileAt, profilesFor } from "../src/sketch/profiles.js";

const captured: SketchDocument = JSON.parse(
  readFileSync("tests/fixtures/projection-cylinder-junctions.json", "utf8"),
).document;
const original = captured.sketches[1];
const body = captured.bodies?.[0];
assert.ok(body);
const wall = body.faces.find((f) => f.cylinder);
assert.ok(wall?.cylinder);
const cylinder = wall.cylinder;
const center = Object.fromEntries(
  (["x", "y"] as const).map((key) => [
    key,
    original.curves
      .filter((c) => c.kind === "segment")
      .reduce((sum, c) => sum + c.a[key] + c.b[key], 0) / 4,
  ]),
) as { x: number; y: number };
const radius = cylinder.radius;
const height = body.volume / (Math.PI * radius ** 2);
const cosine = Math.abs(
  planeNormal(original.plane).reduce((sum, v, i) => sum + v * cylinder.axis[i], 0),
);
const capArea = Math.PI * radius ** 2 * cosine;
const middleArea = 2 * radius * height * Math.sqrt(1 - cosine ** 2) - capArea;

for (const kind of ["body", "face"] as const)
  test(`captured cylinder ${kind} projection joins exact rim contacts before cubic fitting`, async () => {
    assert.equal(profilesFor(original).length, 2, "Capture contains only the two small rim cells");
    assert.equal(profileAt(original, center), undefined, "The reported middle cell is absent");
    const owner = new DocumentOwner();
    try {
      const source = { ...captured, sketches: [captured.sketches[0]] };
      assert.equal((await owner.call({ kind: "open", document: source })).error, undefined);
      const before = owner.view.data;
      const reply = await owner.call({
        kind: "project",
        projection: {
          sources: [
            kind === "body" ? { kind, body: body.id } : { kind, body: body.id, face: wall.id },
          ],
          frame: original.plane,
        },
      });
      assert.equal(reply.error, undefined);
      const projected = reply.view.candidate?.sketches.at(-1);
      assert.ok(projected);
      const profiles = profilesFor(projected);
      assert.equal(profiles.length, 3);
      const middle = profileAt(projected, center);
      assert.ok(middle, "The side/rim junctions bound a selectable middle region");
      assert.ok(Math.abs(middle.area - middleArea) < 0.02);
      assert.ok(
        Math.abs(profiles.reduce((sum, p) => sum + p.area, 0) - middleArea - 2 * capArea) < 0.02,
      );
      checkJunctions(projected);
      assert.deepEqual(owner.view.data, before);
      await owner.call({ kind: "accept" });
      const accepted = owner.view.data;
      const extrusion = await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [{ sketch: projected.id, profile: middle.key }],
          distance: 2,
          mode: "new",
        },
      });
      assert.equal(extrusion.error, undefined);
      assert.ok(
        Math.abs((extrusion.view.candidate?.bodies?.at(-1)?.volume ?? 0) - 2 * middleArea) < 0.04,
      );
      await owner.call({ kind: "discard" });
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data, before);
      await owner.call({ kind: "redo" });
      assert.deepEqual(owner.view.data, accepted);
    } finally {
      owner.close();
    }
  });

function checkJunctions(sketch: Sketch) {
  const cubics = sketch.curves.filter((c) => c.kind === "bezier");
  for (const side of sketch.curves.filter((c) => c.kind === "segment"))
    for (const end of [side.a, side.b]) {
      const neighbors = cubics.filter((c) =>
        [bezierAt(c, 0), bezierAt(c, 1)].some((p) => Math.hypot(p.x - end.x, p.y - end.y) < 1e-7),
      );
      assert.equal(neighbors.length, 2, "Each side meets both rim spans at their endpoints");
    }
}
