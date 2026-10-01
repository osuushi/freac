import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { kernelInput, revolveInput } from "../src/backend/kernel-input.js";
import type { Body } from "../src/model/body.js";
import { resolveOperation } from "../src/model/operation-selection.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import type { ModelingTarget } from "../src/sketch/model-selection-state.js";
import { type PlaneFrame, planeNormal, planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { prism, square } from "./body-edge-fixtures.js";

function centers(bodies: readonly Body[]) {
  return bodies.map((b) => b.center[2]).sort((a, b) => a - b);
}
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("opposite face normals use first support direction for manual resolution and script extrusion", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const caps = [1, -1].map((sign) => {
      const face = body.faces.find((face) => face.plane && planeNormal(face.plane)[2] === sign);
      assert.ok(face);
      return { kind: "face" as const, body: body.id, face: face.id };
    });
    const before = owner.view.data;
    for (const reverse of [false, true])
      for (const distance of [2, -2]) {
        const targets = reverse ? [...caps].reverse() : caps;
        const resolution = resolveOperation("extrude", targets, before);
        assert.ok(resolution.available);
        const input = { sources: resolution.inputs, distance, mode: "new" as const };
        const direction = reverse ? -1 : 1;
        assert.equal(kernelInput(before, input, [body]).normal[2], direction);
        assert.equal((await owner.call({ kind: "extrude", extrusion: input })).error, undefined);
        const preview = owner.view.candidate?.bodies?.filter((b) => b.id !== body.id);
        assert.equal(preview?.length, 2);
        const expected = [(direction * distance) / 2, 10 + (direction * distance) / 2];
        for (const [i, center] of centers(preview ?? []).entries()) near(center, expected[i]);
        assert.equal(owner.view.data, before);
        await owner.call({ kind: "accept" });
        await owner.call({ kind: "undo" });
        assert.equal(owner.view.data, before);
        owner.beginScript("opposite supports");
        await owner.scripts.step({ kind: "extrude", input });
        assert.equal(owner.scripts.finish(), true);
        for (const [i, center] of centers(
          owner.view.data.bodies?.filter((b) => b.id !== body.id) ?? [],
        ).entries())
          near(center, expected[i]);
        await owner.call({ kind: "undo" });
        assert.equal(owner.view.data, before);
      }
    const side = body.faces.find((f) => f.plane && planeNormal(f.plane)[0] === 1);
    assert.ok(side);
    const targets = [caps[0], { kind: "face" as const, body: body.id, face: side.id }];
    assert.equal(resolveOperation("extrude", targets, before).available, false);
    const rejected = await owner.call({
      kind: "extrude",
      extrusion: { sources: targets.map((t) => ({ face: t.face })), distance: 2, mode: "new" },
    });
    assert.match(rejected.error ?? "", /parallel planes/);
    assert.equal(owner.view.data, before);
    assert.equal(owner.view.canRedo, true);
  } finally {
    owner.close();
  }
});

function rectangle(frame: PlaneFrame, x: number, y: number): Sketch {
  const points = [
    { x, y },
    { x: x + 2, y },
    { x: x + 2, y: y + 1 },
    { x, y: y + 1 },
  ];
  return {
    ...emptySketch(frame),
    curves: points.map((a, i) => ({
      id: `edge${i}`,
      kind: "segment",
      a,
      b: points[(i + 1) % 4],
      construction: false,
    })),
  };
}

test("opposite sketch normals resolve and revolve in either order through manual and script calculators", async () => {
  const owner = new DocumentOwner();
  try {
    const sketches = [
      rectangle(planes.XZ, 5, 0),
      rectangle({ ...planes.XZ, v: [0, 0, -1] }, 9, -3),
    ];
    for (const sketch of sketches)
      assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const before = owner.view.data;
    const profiles: ModelingTarget[] = sketches.map((sketch) => ({
      kind: "profile",
      sketch: sketch.id,
      profile: profilesFor(sketch)[0],
    }));
    for (const reverse of [false, true])
      for (const angle of [90, -90]) {
        const resolution = resolveOperation(
          "revolve",
          reverse ? [...profiles].reverse() : profiles,
          before,
        );
        assert.ok(resolution.available);
        const input = {
          sources: resolution.inputs,
          axis: {
            origin: [0, 0, 0] as [number, number, number],
            direction: [0, 0, 1] as [number, number, number],
          },
          angle,
          height: 0,
          mode: "new" as const,
        };
        assert.equal(revolveInput(before, input, []).normal[1], reverse ? 1 : -1);
        assert.equal((await owner.call({ kind: "revolve", revolution: input })).error, undefined);
        near(
          owner.view.candidate?.bodies?.reduce((sum, body) => sum + body.volume, 0) ?? 0,
          16 * Math.PI,
        );
        await owner.call({ kind: "accept" });
        await owner.call({ kind: "undo" });
        assert.equal(owner.view.data, before);
        owner.beginScript("opposite sections");
        await owner.scripts.step({ kind: "revolve", input });
        owner.scripts.finish();
        near(
          owner.view.data.bodies?.reduce((sum, body) => sum + body.volume, 0) ?? 0,
          16 * Math.PI,
        );
        await owner.call({ kind: "undo" });
        assert.equal(owner.view.data, before);
      }
  } finally {
    owner.close();
  }
});
