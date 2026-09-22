import assert from "node:assert/strict";
import test from "node:test";
import type { SketchResult, SolidResult } from "../src/agent-script/api.js";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Revolution } from "../src/model/body.js";

const axis = { origin: [0, 0, 0], direction: [0, 0, 1] } as Revolution["axis"];
async function section(owner: DocumentOwner): Promise<SketchResult> {
  const points = [
    { x: 5, y: 1 },
    { x: 6.5, y: 0.5 },
    { x: 6.5, y: 1.5 },
  ];
  return (await owner.scripts.step({
    kind: "createSketch",
    input: {
      plane: "XZ",
      curves: points.map((a, i) => ({ kind: "segment", a, b: points[(i + 1) % 3] })),
    },
  })) as SketchResult;
}

test("agent helical cut uses the manual kernel and accepts cylinder/sketch/cut as one Undo", async () => {
  const owner = new DocumentOwner();
  try {
    const original = owner.view.data;
    owner.beginScript("thread.ts");
    const base = (await owner.scripts.step({
      kind: "createSketch",
      input: { plane: "XY", curves: [{ kind: "circle", center: { x: 0, y: 0 }, radius: 6 }] },
    })) as SketchResult;
    const shaft = (await owner.scripts.step({
      kind: "extrude",
      input: { sources: base.profiles, distance: 12, mode: "new" },
    })) as SolidResult;
    const triangle = await section(owner);
    const cut = (await owner.scripts.step({
      kind: "revolve",
      input: {
        sources: triangle.profiles,
        axis,
        angle: 720,
        height: 8,
        mode: "subtract",
        targets: [shaft.bodies[0].id],
      },
    })) as SolidResult;
    // Integrate r * section-width from radius 5 to 6 through two revolutions.
    const expected = 432 * Math.PI - (68 * Math.PI) / 9;
    assert.equal(cut.bodies.length, 1);
    assert(Math.abs(cut.bodies[0].volume - expected) < 0.01);
    assert.equal(owner.view.data, original);
    owner.scripts.finish();
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
  } finally {
    owner.close();
  }
});

test("script helix signs preserve the same radial end section as manual Revolve", async () => {
  const owner = new DocumentOwner();
  try {
    for (const angle of [450, -450]) {
      owner.beginScript("helix.ts");
      const triangle = await section(owner);
      await owner.scripts.step({
        kind: "revolve",
        input: { sources: triangle.profiles, axis, angle, height: 5, mode: "new" },
      });
      owner.scripts.finish();
      const body = owner.view.data.bodies?.[0];
      assert(body);
      const cap = body.faces.find(
        (f) => f.plane && f.vertices.every((v, i) => i % 3 !== 2 || v > 5.49),
      );
      assert(cap?.plane);
      for (let i = 0; i < cap.vertices.length; i += 3) {
        assert(Math.abs(cap.vertices[i]) < 1e-5);
        const radial = cap.vertices[i + 1] * Math.sign(angle);
        assert(radial >= 5 - 1e-5 && radial <= 6.5 + 1e-5);
        assert(cap.vertices[i + 2] <= 6.5 + 1e-5);
      }
      const manual = await owner.call({
        kind: "revolve",
        revolution: { sources: triangle.profiles, axis, angle, height: 5, mode: "new" },
      });
      assert.equal(manual.error, undefined);
      const preview = manual.view.candidate?.bodies?.at(-1);
      assert(preview);
      assert(Math.abs(preview.volume - body.volume) < 1e-6);
      await owner.call({ kind: "discard" });
      await owner.call({ kind: "new" });
    }
  } finally {
    owner.close();
  }
});

test("invalid script revolutions fail without accepting a candidate or losing Redo", async () => {
  const owner = new DocumentOwner();
  try {
    owner.beginScript("seed.ts");
    await section(owner);
    owner.scripts.finish();
    await owner.call({ kind: "undo" });
    const original = owner.view.data;
    for (const changes of [
      { angle: 0 },
      { height: NaN },
      { axis: { origin: [0, 0, 0], direction: [0, 0, 0] } },
      { sources: [{ face: "missing" }] },
      { targets: ["missing"] },
      { angle: 720, height: 0 },
    ] as Partial<Revolution>[]) {
      owner.beginScript("bad.ts");
      const triangle = await section(owner);
      await assert.rejects(() =>
        owner.scripts.step({
          kind: "revolve",
          input: {
            sources: triangle.profiles,
            axis,
            angle: 450,
            height: 5,
            mode: "new",
            ...changes,
          },
        }),
      );
      await owner.scripts.cancel("Invalid revolution");
      assert.equal(owner.view.data, original);
      assert(owner.view.canRedo);
    }
  } finally {
    owner.close();
  }
});
