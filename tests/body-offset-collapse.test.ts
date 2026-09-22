import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { lift, prism, square } from "./body-edge-fixtures.js";
import { cap } from "./shell-fixtures.js";

const captured = JSON.parse(readFileSync("tests/fixtures/collapsed-offset-wall.json", "utf8"));
const radius = 13.038404810405298;
function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
}
async function rotate(owner: DocumentOwner, body: Body) {
  assert.equal(
    (
      await owner.call({
        kind: "transform-bodies",
        transform: {
          ids: [body.id],
          axis: [1, 2, 3],
          angle: 37,
          pivot: [0, 0, 0],
          translation: [12, -8, 3],
          duplicate: false,
        },
      })
    ).error,
    undefined,
  );
  return owner.view.data.bodies?.[0] as Body;
}
async function offset(owner: DocumentOwner, body: Body, face: string, distance: number) {
  const reply = await owner.call({
    kind: "offset-faces",
    operation: { faces: [{ body: body.id, face }], distance },
  });
  assert.equal(reply.error, undefined);
  assert.equal(reply.view.offsetDistance, distance, "Requested distance must not clamp at a rib");
  const result = reply.view.candidate?.bodies?.[0];
  assert.ok(result);
  return result;
}
for (const z of [0, 11.00048828125])
  test(`captured collapsed wall recovers and offsets cap at ${z}`, async () => {
    const owner = new DocumentOwner();
    try {
      assert.equal((await owner.call({ kind: "open", document: captured })).error, undefined);
      const original = owner.view.data;
      const body = original.bodies?.[0];
      assert.ok(body);
      const face = cap(body, z);
      for (const distance of [-2, -0.00048828125, -5, 2, -2]) {
        const next = await offset(owner, body, face, distance);
        close(next.volume, Math.PI * radius ** 2 * (11.00048828125 + distance));
        assert.equal(next.faces.length, 3);
        assert.equal(next.edges.length, 3);
        close(next.bounds[2], z === 0 ? -distance - 1e-7 : -1e-7);
        close(next.bounds[5], z === 0 ? 11.00048838125 : 11.00048838125 + distance);
        const wall = next.faces.find((f) => f.cylinder);
        assert.ok(wall?.cylinder);
        close(wall.cylinder.radius, radius);
        assert.ok(!body.faces.some((f) => f.id === wall.id), "Merged wall gets a fresh ID");
        assert.equal(owner.view.data, original);
        assert.ok(next.faces.some((f) => f.id === face));
        assert.equal(owner.view.offsetSelection?.[0]?.face, face);
      }
      await owner.call({ kind: "accept" });
      const accepted = owner.view.data;
      await owner.call({ kind: "undo" });
      assert.equal(owner.view.data, original);
      await owner.call({ kind: "redo" });
      assert.equal(owner.view.data, accepted);
      assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
      const reopened = owner.view.data.bodies?.[0];
      assert.ok(reopened);
      const next = await offset(owner, reopened, face, -1);
      close(next.volume, Math.PI * radius ** 2 * 8.00048828125);
    } finally {
      owner.close();
    }
  });

for (const round of [false, true])
  test(`${round ? "circular" : "rectangular"} stacked walls disappear only when reached`, async () => {
    const owner = new DocumentOwner();
    try {
      let body = round
        ? await lift(owner, {
            ...emptySketch(planes.XY),
            curves: [
              { id: "circle", kind: "circle", center: { x: 0, y: 0 }, radius, construction: false },
            ],
          })
        : await prism(owner, square);
      for (const z of [10, 20]) {
        const reply = await owner.call({
          kind: "extrude",
          extrusion: { sources: [{ face: cap(body, z) }], distance: 10, mode: "union" },
        });
        assert.equal(reply.error, undefined);
        await owner.call({ kind: "accept" });
        body = owner.view.data.bodies?.[0] as Body;
      }
      const original = owner.view.data;
      const top = cap(body, 30),
        bottom = cap(body, 0);
      const area = round ? Math.PI * radius ** 2 : 400;
      const sides = round ? 1 : 4;
      for (const face of [top, bottom]) {
        for (const distance of [-5, -10, -15, -20, -25, -5]) {
          const next = await offset(owner, body, face, distance);
          close(next.volume, area * (30 + distance));
          const bands = distance > -10 ? 3 : distance > -20 ? 2 : 1;
          assert.equal(next.faces.length, 2 + sides * bands);
          if (distance === -10) {
            const remote = body.faces.filter(
              (f) => Math.abs(f.signature[5] - (face === top ? 5 : 25)) < 1e-6,
            );
            assert.equal(remote.length, sides);
            for (const f of remote) assert.ok(next.faces.some((n) => n.id === f.id));
          }
          assert.ok(next.faces.some((f) => f.id === face));
          assert.equal(owner.view.data, original);
        }
        await owner.call({ kind: "discard" });
      }
      const rotated = await rotate(owner, body);
      const next = await offset(owner, rotated, top, -25);
      close(next.volume, area * 5);
      assert.equal(next.faces.length, 2 + sides);
    } finally {
      owner.close();
    }
  });

test("recovered captured body rotates and keeps both caps editable", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: captured })).error, undefined);
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    const faces = [cap(body, 0), cap(body, 11.00048828125)];
    const healed = await offset(owner, body, faces[1], -2);
    await owner.call({ kind: "accept" });
    const rotated = await rotate(owner, healed);
    for (const face of faces) {
      const next = await offset(owner, rotated, face, -5);
      close(next.volume, Math.PI * radius ** 2 * 4.00048828125);
      assert.equal(next.faces.length, 3);
      assert.ok(next.faces.some((f) => f.id === face));
      await owner.call({ kind: "discard" });
    }
  } finally {
    owner.close();
  }
});
