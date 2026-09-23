import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { BodyFaceOffset, BodyShell, Face } from "../src/model/body.js";
import { exportBodies } from "../src/model/mesh-export.js";
import { arcCircle } from "../src/sketch/arc-geometry.js";
import { emptySketch, type SketchDocument } from "../src/sketch/document.js";
import { hasClosedEndpoints } from "../src/sketch/loop-boundary.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

function capture<T>(name: string): { document: SketchDocument; selection: T } {
  return JSON.parse(readFileSync(`tests/fixtures/${name}.json`, "utf8"));
}
function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected}`);
}
async function history(owner: DocumentOwner) {
  const before = owner.view.data;
  assert.equal((await owner.call({ kind: "accept" })).error, undefined);
  const after = owner.view.data;
  assert.equal((await owner.call({ kind: "undo" })).error, undefined);
  assert.deepEqual(owner.view.data, before);
  assert.equal((await owner.call({ kind: "redo" })).error, undefined);
  assert.deepEqual(owner.view.data, after);
  assert.equal((await owner.call({ kind: "open", document: after })).error, undefined);
  return after;
}

test("captured cup floor offsets without moving the fillets or exterior supports", async () => {
  const fixture = capture<BodyFaceOffset["faces"]>("offset-cup-floor");
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    const body = before.bodies?.[0];
    assert.ok(body);
    for (const distance of [1, 5, 15]) {
      const reply = await owner.call({
        kind: "offset-faces",
        operation: { faces: fixture.selection, distance },
      });
      assert.equal(reply.error, undefined);
      near(reply.view.offsetDistance ?? NaN, distance);
      const result = reply.view.candidate?.bodies?.[0];
      assert.ok(result);
      for (const format of ["stl", "3mf"] as const)
        assert.ok(exportBodies([result], format).length > 0);
      near(result.volume - body.volume, Math.PI * 28 ** 2 * distance);
      assert.deepEqual(
        new Set(result.faces.map((f) => f.id)),
        new Set(body.faces.map((f) => f.id)),
      );
      near(
        result.faces.find((f) => f.id === fixture.selection[0].face)?.plane?.origin[2] ?? NaN,
        distance,
      );
      for (const face of body.faces.filter((f) => f.id !== fixture.selection[0].face)) {
        const current: Face | undefined = result.faces.find((f) => f.id === face.id);
        assert.deepEqual(current?.cylinder, face.cylinder);
        assert.deepEqual(current?.plane, face.plane);
      }
      assert.equal(owner.view.data, before);
      await owner.call({ kind: "discard" });
    }
    await owner.call({
      kind: "offset-faces",
      operation: { faces: fixture.selection, distance: 5 },
    });
    await history(owner);
    const reply = await owner.call({
      kind: "offset-faces",
      operation: { faces: fixture.selection, distance: 1 },
    });
    assert.equal(reply.error, undefined);
    near(reply.view.offsetDistance ?? NaN, 1);
    near(reply.view.candidate?.bodies?.[0].volume ?? NaN, body.volume + Math.PI * 28 ** 2 * 6);
  } finally {
    owner.close();
  }
});

test("captured narrow arc loop closes into independently editable offset sections", async () => {
  const fixture = capture<unknown>("offset-split-arcs");
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    const sketch = before.sketches[0];
    const request = (amount: number) => ({
      kind: "offset-sketch" as const,
      sketchId: sketch.id,
      curves: sketch.curves.map((c) => c.id),
      amount,
    });
    for (const amount of [-1, -2]) {
      const reply = await owner.call(request(amount));
      assert.equal(reply.error, undefined);
      const candidate = reply.view.candidate?.sketches[0];
      assert.ok(candidate);
      const added = candidate.curves.slice(sketch.curves.length);
      assert.deepEqual(candidate.curves.slice(0, sketch.curves.length), sketch.curves);
      assert.deepEqual(
        candidate.constraints.slice(0, sketch.constraints.length),
        sketch.constraints,
      );
      const bounded = added.filter((c) => c.kind !== "circle");
      assert.ok(!bounded.length || hasClosedEndpoints(bounded));
      const profiles = profilesFor({ ...emptySketch(planes.XY), curves: added });
      assert.equal(profiles.length, amount === -1 ? 2 : 3);
      if (amount === -1) {
        assert.equal(added.length, 3);
        const radii = added
          .map((c) =>
            c.kind === "circle" ? c.radius : c.kind === "arc" ? arcCircle(c).radius : NaN,
          )
          .sort((a, b) => a - b);
        [2, 5, 11].forEach((r, i) => {
          near(radii[i], r);
        });
        assert.equal(candidate.constraints.length, sketch.constraints.length + 2);
      } else {
        assert.ok(added.every((c) => c.kind === "circle"));
        near(
          profiles.reduce((sum, p) => sum + p.area, 0),
          Math.PI * (100 + 16 + 1),
        );
      }
      assert.equal(owner.view.data, before);
      await owner.call({ kind: "discard" });
    }
    await owner.call(request(-1));
    const after = await history(owner);
    const copied = after.sketches[0];
    const circle = copied.curves.find((c) => c.kind === "circle");
    assert.ok(circle?.kind === "circle");
    assert.equal(
      (
        await owner.call({
          kind: "edit",
          sketch: {
            ...copied,
            curves: copied.curves.map((c) =>
              c.id === circle.id ? { ...circle, center: { x: 25, y: 2 } } : c,
            ),
          },
        })
      ).error,
      undefined,
    );
    assert.deepEqual(
      owner.view.data.sketches[0].curves.slice(0, sketch.curves.length),
      sketch.curves,
    );
  } finally {
    owner.close();
  }
});

test("captured notched cylinder shells with intersecting offset surfaces", async () => {
  const fixture = capture<BodyShell["selection"]>("shell-notched-cylinder");
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    for (const thickness of [-2, 2]) {
      const reply = await owner.call({
        kind: "shell",
        operation: { selection: fixture.selection, thickness },
      });
      assert.equal(reply.error, undefined);
      const body = reply.view.candidate?.bodies?.[0];
      assert.ok(body && body.volume > 0);
      for (const format of ["stl", "3mf"] as const)
        assert.ok(exportBodies([body], format).length > 0);
      assert.equal(owner.view.data, before);
      assert.ok(!body.faces.some((f) => f.id === fixture.selection[0].faces[0]));
      await owner.call({ kind: "discard" });
    }
    await owner.call({ kind: "shell", operation: { selection: fixture.selection, thickness: -2 } });
    await history(owner);
  } finally {
    owner.close();
  }
});
