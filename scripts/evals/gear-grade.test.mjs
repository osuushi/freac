// Validate the evaluator using native geometry and deliberate defects; no model calls.
import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../../.cache/sketch-tests/src/backend/document-owner.js";
import { cases } from "./gear-cases.mjs";
import { gradeTrain, trainGeometry } from "./gear-grade.mjs";

async function train(
  owner,
  specs = [
    [0, 20, 0, 0],
    [40, 60, 3, 0],
  ],
) {
  owner.beginScript("grader fixture");
  const known = new Set();
  for (const [x, teeth, phase, z] of specs) {
    const s = await owner.scripts.step({
      kind: "createSketch",
      input: {
        plane: { origin: [0, 0, z], u: [1, 0, 0], v: [0, 1, 0] },
        curves: [{ kind: "circle", center: { x, y: 0 }, radius: teeth / 2 }],
      },
    });
    const result = await owner.scripts.step({
      kind: "extrude",
      input: { sources: s.profiles, distance: 6, mode: "new" },
    });
    let target;
    for (const b of result.bodies) {
      if (known.has(b.id)) continue;
      known.add(b.id);
      const t = await owner.scripts.step({ kind: "topology", input: { body: b.id } });
      const face = t.faces.find(
        (f) => f.surface.kind === "cylinder" && Math.abs(f.surface.origin[0] - x) < 1e-7,
      );
      if (face) target = { body: b.id, face: face.id };
    }
    assert(target);
    await owner.scripts.step({
      kind: "editDecorator",
      input: {
        action: "apply",
        definition: "freac.gear",
        faces: [target],
        settings: { teeth, phase, thinning: 0.04 },
      },
    });
  }
  owner.scripts.finish();
  return owner.view.data;
}

test("grader accepts a native pair and catches phase, ratio, spacing and width defects", async () => {
  const owner = new DocumentOwner();
  try {
    const good = await train(owner);
    const passed = await gradeTrain(good, cases.pair);
    assert.deepEqual(passed.failures, []);
    const phase = structuredClone(good);
    phase.decorators[1].settings.phase += 3;
    const collision = await gradeTrain(phase, cases.pair);
    assert(collision.failures.some((f) => f.includes("sampled interference")));
    const wrongCount = structuredClone(good);
    wrongCount.decorators[1].settings.teeth = 58;
    assert(trainGeometry(wrongCount, cases.pair).failures.some((f) => f.includes("ratio")));
    owner.beginScript("separate axial bands");
    await owner.scripts.step({
      kind: "transformBodies",
      input: {
        ids: [good.bodies[1].id],
        translation: [0, 0, 7],
        pivot: [0, 0, 0],
        axis: [0, 0, 1],
        angle: 0,
        duplicate: false,
      },
    });
    owner.scripts.finish();
    const separated = trainGeometry(owner.view.data, cases.pair);
    assert(separated.failures.some((f) => f.includes("Missing expected")));
    assert(separated.failures.some((f) => f.includes("Envelope")));
    await owner.call({ kind: "undo" });
    owner.beginScript("wrong center distance");
    await owner.scripts.step({
      kind: "transformBodies",
      input: {
        ids: [good.bodies[1].id],
        translation: [2, 0, 0],
        pivot: [0, 0, 0],
        axis: [0, 0, 1],
        angle: 0,
        duplicate: false,
      },
    });
    owner.scripts.finish();
    assert(
      trainGeometry(owner.view.data, cases.pair).failures.some((f) =>
        f.includes("Missing expected"),
      ),
    );
  } finally {
    owner.close();
  }
});

test("grader checks compound coupling and collisions between non-mating parts", async () => {
  const owner = new DocumentOwner();
  try {
    const good = await train(owner, [
      [0, 18, -90, 0],
      [36, 54, 90 - 180 / 54, 0],
      [36, 18, -90, 8],
      [81, 72, 87.5, 8],
    ]);
    assert.deepEqual((await gradeTrain(good, cases.compound)).failures, []);
    owner.beginScript("overlap stages");
    await owner.scripts.step({
      kind: "transformBodies",
      input: {
        ids: good.bodies.slice(2).map((b) => b.id),
        translation: [0, 0, -8],
        pivot: [0, 0, 0],
        axis: [0, 0, 1],
        angle: 0,
        duplicate: false,
      },
    });
    owner.scripts.finish();
    const collision = await gradeTrain(owner.view.data, cases.compound);
    assert(collision.probes.some((p) => p.kind === "input-revolution" && p.maxVolume > 1));
    assert.equal(collision.passed, false);
  } finally {
    owner.close();
  }
});
