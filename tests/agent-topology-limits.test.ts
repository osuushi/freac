import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { BodyTopology } from "../src/model/topology-edit.js";
import { cylinder } from "./agent-topology-fixture.js";

test("inner-wall replacement works on a rotated translated body and a reversed axis", async () => {
  const owner = new DocumentOwner();
  try {
    owner.beginScript("outer.ts");
    await cylinder(owner, 20, 0, 24);
    owner.scripts.finish();
    const body = owner.view.data.bodies?.[0].id;
    assert(body);
    owner.beginScript("hole.ts");
    await cylinder(owner, 5, 0, 24, "subtract", [body]);
    owner.scripts.finish();
    owner.beginScript("rotate.ts");
    await owner.scripts.step({
      kind: "transformBodies",
      input: {
        ids: [body],
        pivot: [0, 0, 0],
        axis: [1, 0, 0],
        angle: 90,
        translation: [3, 4, 5],
        duplicate: false,
      },
    });
    owner.scripts.finish();
    owner.beginScript("inner.ts");
    const t = (await owner.scripts.step({ kind: "topology", input: { body } })) as BodyTopology;
    const inner = t.faces.find(
      (f) => f.surface.kind === "cylinder" && Math.abs(f.surface.radius - 5) < 1e-7,
    );
    assert(inner);
    assert(inner.surface.kind === "cylinder");
    assert.equal(inner.surface.outward, -1);
    await owner.scripts.step({
      kind: "replaceFace",
      input: {
        body,
        face: inner.id,
        surface: {
          kind: "cone",
          origin: [3, -20, 5],
          axis: [0, 1, 0],
          radius: 6,
          semiAngle: (Math.atan(-2 / 24) * 180) / Math.PI,
        },
      },
    });
    const result = (await owner.scripts.step({
      kind: "topology",
      input: { body },
    })) as BodyTopology;
    for (const plane of t.faces.filter((f) => f.surface.kind === "plane"))
      assert.deepEqual(result.faces.find((f) => f.id === plane.id)?.surface, plane.surface);
    owner.scripts.finish();
    assert(
      Math.abs(
        (owner.view.data.bodies?.[0].volume ?? 0) - Math.PI * 24 * (400 - (16 + 24 + 36) / 3),
      ) < 1e-5,
    );
  } finally {
    owner.close();
  }
});

test("replacement rejects material inversion, missing IDs and non-axial faces", async () => {
  const owner = new DocumentOwner();
  try {
    owner.beginScript("outer.ts");
    await cylinder(owner, 20, 0, 24);
    owner.scripts.finish();
    const body = owner.view.data.bodies?.[0].id;
    assert(body);
    owner.beginScript("hole.ts");
    await cylinder(owner, 5, 0, 24, "subtract", [body]);
    owner.scripts.finish();
    const before = owner.view.data;
    const outer = before.bodies?.[0].faces.find((f) => f.cylinder?.radius === 20);
    assert(outer);
    const plane = before.bodies?.[0].faces.find((f) => f.plane);
    assert(plane);
    for (const [face, radius, pattern] of [
      [outer.id, 2, /invalid|orientation|interference|volume|reconnect/i],
      [plane.id, 18, /cylindrical or conical/],
      ["missing", 18, /Unknown replacement face/],
    ] as const) {
      owner.beginScript("reject.ts");
      await assert.rejects(
        () =>
          owner.scripts.step({
            kind: "replaceFace",
            input: {
              body,
              face,
              surface: { kind: "cylinder", origin: [0, 0, 0], axis: [0, 0, 1], radius },
            },
          }),
        pattern,
      );
      await owner.scripts.cancel();
      assert.equal(owner.view.data, before);
    }
  } finally {
    owner.close();
  }
});
