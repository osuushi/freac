import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { BodyTopology } from "../src/model/topology-edit.js";
import { cylinder } from "./agent-topology-fixture.js";

const near = (actual: number, expected: number) =>
  assert(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected}`);
const topology = async (owner: DocumentOwner, body: string) =>
  (await owner.scripts.step({ kind: "topology", input: { body } })) as BodyTopology;

test("inspect, replace cylindrical support with cone, re-edit and Undo retain body/topology identity", async () => {
  const owner = new DocumentOwner();
  try {
    owner.beginScript("fixture.ts");
    await cylinder(owner, 20, 0, 24);
    owner.scripts.finish();
    const original = owner.view.data;
    const body = original.bodies?.[0];
    assert(body);
    owner.beginScript("inspect.ts");
    const t = await topology(owner, body.id);
    const wall = t.faces.find((f) => f.surface.kind === "cylinder");
    assert(wall);
    assert.equal(wall.loops.length, 1);
    assert.equal(wall.loops[0].edges.filter((e) => e.seam).length, 2);
    assert.equal(t.edges.filter((e) => e.curve.kind === "circle").length, 2);
    assert.equal(owner.scripts.finish(), false);
    owner.beginScript("identity.ts");
    await owner.scripts.step({
      kind: "replaceFace",
      input: {
        body: body.id,
        face: wall.id,
        surface: { kind: "cylinder", origin: [0, 0, 12], axis: [0, 0, -1], radius: 20 },
      },
    });
    assert.equal(owner.scripts.finish(), false);
    owner.beginScript("replace.ts");
    await owner.scripts.step({
      kind: "replaceFace",
      input: {
        body: body.id,
        face: wall.id,
        surface: {
          kind: "cone",
          origin: [0, 0, 0],
          axis: [0, 0, 1],
          radius: 18,
          semiAngle: (Math.atan(4 / 24) * 180) / Math.PI,
        },
      },
    });
    const edited = await topology(owner, body.id);
    assert.equal(edited.faces.find((f) => f.id === wall.id)?.surface.kind, "cone");
    assert.deepEqual(edited.faces.map((f) => f.id).sort(), t.faces.map((f) => f.id).sort());
    assert.deepEqual(edited.edges.map((e) => e.id).sort(), t.edges.map((e) => e.id).sort());
    assert.deepEqual(
      edited.edges
        .filter((e) => e.curve.kind === "circle")
        .map((e) => (e.curve.kind === "circle" ? e.curve.radius : 0))
        .sort((a, b) => a - b),
      [18, 22],
    );
    assert.equal(owner.view.data, original);
    owner.scripts.finish();
    near(
      owner.view.data.bodies?.[0].volume ?? NaN,
      ((Math.PI * 24) / 3) * (18 * 18 + 18 * 22 + 22 * 22),
    );
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data, accepted);
    owner.beginScript("re-edit.ts");
    await owner.scripts.step({
      kind: "replaceFace",
      input: {
        body: body.id,
        face: wall.id,
        surface: { kind: "cylinder", origin: [0, 0, 0], axis: [0, 0, 1], radius: 21 },
      },
    });
    owner.scripts.finish();
    near(owner.view.data.bodies?.[0].volume ?? NaN, Math.PI * 21 * 21 * 24);
  } finally {
    owner.close();
  }
});

test("face replacement preserves stepped base and hole; invalid replacement rolls back all script edits", async () => {
  const owner = new DocumentOwner();
  try {
    owner.beginScript("base.ts");
    await cylinder(owner, 30, 0, 4);
    owner.scripts.finish();
    const body = owner.view.data.bodies?.[0].id;
    assert(body);
    owner.beginScript("neck.ts");
    await cylinder(owner, 20, 4, 20, "union", [body]);
    owner.scripts.finish();
    owner.beginScript("hole.ts");
    await cylinder(owner, 5, 0, 24, "subtract", [body]);
    owner.scripts.finish();
    const before = owner.view.data;
    owner.beginScript("taper.ts");
    const original = await topology(owner, body);
    const wall = original.faces.find(
      (f) => f.surface.kind === "cylinder" && Math.abs(f.surface.radius - 20) < 1e-7,
    );
    assert(wall);
    await owner.scripts.step({
      kind: "replaceFace",
      input: {
        body,
        face: wall.id,
        surface: {
          kind: "cone",
          origin: [0, 0, 4],
          axis: [0, 0, 1],
          radius: 18,
          semiAngle: (Math.atan(4 / 20) * 180) / Math.PI,
        },
      },
    });
    const after = await topology(owner, body);
    for (const f of original.faces.filter(
      (f) => f.surface.kind === "cylinder" && f.id !== wall.id,
    )) {
      const next = after.faces.find((n) => n.id === f.id);
      assert(next);
      assert.deepEqual(next.surface, f.surface);
      near(next.area, f.area);
    }
    owner.scripts.finish();
    near(
      owner.view.data.bodies?.[0].volume ?? NaN,
      Math.PI * (4 * (30 * 30 - 25) + 20 * ((18 * 18 + 18 * 22 + 22 * 22) / 3 - 25)),
    );
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, before);
    owner.beginScript("invalid.ts");
    await cylinder(owner, 1, 40, 2);
    await assert.rejects(
      () =>
        owner.scripts.step({
          kind: "replaceFace",
          input: {
            body,
            face: wall.id,
            surface: {
              kind: "cone",
              origin: [0, 0, 4],
              axis: [0, 0, 1],
              radius: 18,
              semiAngle: -60,
            },
          },
        }),
      /apex|collaps/,
    );
    await owner.scripts.cancel("Expected apex rejection");
    assert.equal(owner.view.data, before);
    assert(owner.view.canRedo);
    owner.beginScript("off-axis.ts");
    await assert.rejects(
      () =>
        owner.scripts.step({
          kind: "replaceFace",
          input: {
            body,
            face: wall.id,
            surface: { kind: "cylinder", origin: [1, 0, 0], axis: [0, 0, 1], radius: 20 },
          },
        }),
      /coaxial/,
    );
    await owner.scripts.cancel();
  } finally {
    owner.close();
  }
});
