import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { sectionProfile } from "../src/model/sketch-section.js";
import { emptySketch } from "../src/sketch/document.js";
import { type PlaneFrame, planes } from "../src/sketch/planes.js";
import { insideBoundary, profilesFor } from "../src/sketch/profiles.js";
import { projectedSketch } from "../src/sketch/projected-sketch.js";

const middle: PlaneFrame = { ...planes.XY, origin: [0, 0, 10] };
async function hollowCylinder(owner: DocumentOwner) {
  const sketch = {
    ...emptySketch(planes.XY),
    curves: [10, 5].map((radius, i) => ({
      id: `circle-${i}`,
      kind: "circle" as const,
      center: { x: 0, y: 0 },
      radius,
      construction: false,
    })),
  };
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  const ring = profilesFor(sketch).find((p) => p.holes.length === 1);
  assert.ok(ring);
  assert.equal(
    (
      await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [{ sketch: sketch.id, profile: ring.key }],
          distance: 20,
          mode: "new",
        },
      })
    ).error,
    undefined,
  );
  await owner.call({ kind: "accept" });
  return sketch;
}

test("exact material sections preserve holes, independent regions, oblique curves and read-only history", async () => {
  const owner = new DocumentOwner();
  try {
    const sketch = await hollowCylinder(owner);
    const before = owner.view.data;
    assert.ok(before.bodies);
    const bodies = before.bodies.map((b) => b.id);
    const history = (await owner.call({ kind: "read-history" })).history;
    const read = async (frame: PlaneFrame) => {
      const reply = await owner.call({ kind: "sections", frame, bodies });
      assert.equal(reply.error, undefined);
      assert.ok(reply.sections);
      return reply.sections;
    };
    const [sections, measured] = await Promise.all([
      read(middle),
      owner.call({
        kind: "measure",
        targets: [{ kind: "curve", sketch: sketch.id, curve: sketch.curves[0].id }],
      }),
    ]);
    assert.equal(
      measured.error,
      undefined,
      "section refresh and measurements share their worker safely",
    );
    assert.ok(measured.measurement);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].curves.length, 2);
    assert.ok(sections[0].curves.every((c) => c.kind === "circle"));
    const profile = sectionProfile(sections[0], middle);
    assert.ok(profile);
    assert.equal(profile.holes.length, 1);
    assert.ok(Math.abs(profile.area - 75 * Math.PI) < 1e-6);
    assert.equal(insideBoundary(profile.holes[0], { x: 0, y: 0 }), true);
    const shifted: PlaneFrame = { origin: [3, 4, 10], u: [0, 1, 0], v: [-1, 0, 0] };
    const shiftedSections = await read(shifted);
    for (const curve of shiftedSections[0].curves) {
      assert.equal(curve.kind, "circle");
      if (curve.kind === "circle") {
        assert.ok(Math.abs(curve.center.x + 4) < 1e-7);
        assert.ok(Math.abs(curve.center.y - 3) < 1e-7);
      }
    }
    const vertical = await read(planes.XZ);
    assert.equal(vertical.length, 2);
    for (const region of vertical) {
      const p = sectionProfile(region, planes.XZ);
      assert.ok(p);
      assert.ok(Math.abs(p.area - 100) < 1e-6);
    }
    const tilted: PlaneFrame = { origin: [0, 0, 10], u: [1, 0, 0], v: [0, Math.sqrt(3) / 2, 0.5] };
    const oblique = await read(tilted);
    assert.equal(oblique.length, 1);
    const tiltedProfile = sectionProfile(oblique[0], tilted);
    assert.ok(tiltedProfile);
    assert.equal(tiltedProfile.holes.length, 1);
    assert.ok(Math.abs(tiltedProfile.area - (75 * Math.PI) / (Math.sqrt(3) / 2)) < 0.05);
    assert.equal((await read({ ...middle, origin: [0, 0, 30] })).length, 0);
    assert.equal((await read(planes.XY)).length, 1, "coplanar end face remains a material region");
    assert.deepEqual(owner.view.data, before);
    assert.deepEqual((await owner.call({ kind: "read-history" })).history, history);
    const copy = projectedSketch(emptySketch(middle), sections[0].curves);
    assert.equal((await owner.call({ kind: "edit", sketch: copy })).error, undefined);
    assert.equal(owner.view.data.sketches.length, 2);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data.sketches.at(-1), copy);
    assert.deepEqual(owner.view.data.bodies, before.bodies);
  } finally {
    owner.close();
  }
});
