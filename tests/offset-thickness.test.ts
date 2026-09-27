import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { sharedThickness } from "../src/model/face-offset-targets.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { lift, prism, square } from "./body-edge-fixtures.js";
import { shell } from "./shell-fixtures.js";

test("concentric tube walls publish exact thickness and preserve the fixed reference on offset", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [8, 3].map((radius) => ({
        id: `circle${radius}`,
        kind: "circle",
        center: { x: 0, y: 0 },
        radius,
        construction: false,
      })),
    });
    const walls = body.faces.filter((face) => face.cylinder);
    assert.equal(walls.length, 2);
    for (const wall of walls) {
      assert.ok(wall.thickness);
      assert.equal(wall.thickness.distance, 5);
      assert.equal(wall.thickness.slope, 1);
      assert.equal(wall.thickness.face, walls.find((f) => f !== wall)?.id);
      assert.ok(sharedThickness([wall], [{ body: body.id, face: wall.id }]));
      const reply = await owner.call({
        kind: "offset-faces",
        operation: {
          faces: [{ body: body.id, face: wall.id }],
          distance: 1,
        },
      });
      assert.equal(reply.error, undefined);
      const candidate = reply.view.candidate?.bodies?.find((b) => b.id === body.id);
      assert.ok(candidate);
      const moved = candidate.faces.find((f) => f.id === wall.id);
      assert.equal(moved?.thickness?.distance, 6);
      const other = candidate.faces.find((f) => f.id === wall.thickness?.face);
      assert.equal(other?.cylinder?.radius, walls.find((f) => f !== wall)?.cylinder?.radius);
      await owner.call({ kind: "discard" });
    }
    assert.equal(
      sharedThickness(
        walls,
        walls.map((f) => ({ body: body.id, face: f.id })),
      ),
      null,
    );
    assert.ok(body.faces.filter((f) => f.plane).every((f) => f.thickness?.distance === 10));
  } finally {
    owner.close();
  }
});

test("planar walls measure thickness while unmatched or eccentric cylinders remain relative-only", async () => {
  const owner = new DocumentOwner();
  try {
    const box = await prism(owner, square);
    assert.ok(box.faces.every((f) => f.thickness && [10, 20].includes(f.thickness.distance)));
    for (const eccentric of [false, true]) {
      const body = await lift(owner, {
        ...emptySketch(planes.XY),
        curves: (eccentric ? [8, 3] : [8]).map((radius) => ({
          id: `circle${radius}`,
          kind: "circle",
          center: { x: radius === 3 ? 1 : 0, y: 0 },
          radius,
          construction: false,
        })),
      });
      assert.ok(body.faces.filter((f) => f.cylinder).every((f) => !f.thickness));
    }
  } finally {
    owner.close();
  }
});

test("spherical thickness offsets the radius with a fixed concentric reference", async () => {
  const owner = new DocumentOwner();
  try {
    const sketch = {
      ...emptySketch(planes.XZ),
      curves: [
        {
          id: "arc",
          kind: "arc" as const,
          a: { x: 0, y: -4 },
          b: { x: 0, y: 4 },
          bulge: 1,
          construction: false,
        },
        {
          id: "axis",
          kind: "segment" as const,
          a: { x: 0, y: 4 },
          b: { x: 0, y: -4 },
          construction: false,
        },
      ],
    };
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    assert.equal(
      (
        await owner.call({
          kind: "revolve",
          revolution: {
            sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
            axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
            angle: 360,
            height: 0,
            mode: "new",
          },
        })
      ).error,
      undefined,
    );
    await owner.call({ kind: "accept" });
    const sphere = owner.view.data.bodies?.[0];
    assert.ok(sphere);
    const hollow = await shell(owner, sphere, -1);
    await owner.call({ kind: "accept" });
    for (const face of hollow.faces) {
      const reply = await owner.call({
        kind: "offset-faces",
        operation: {
          faces: [{ body: hollow.id, face: face.id }],
          distance: 0.25,
        },
      });
      assert.equal(reply.error, undefined);
      const body = reply.view.candidate?.bodies?.[0];
      assert.ok(body);
      assert.equal(reply.view.offsetDistance, 0.25);
      assert.ok(
        body.faces.every((f) => Math.abs((f.thickness?.distance ?? 0) - 1.25) < 1e-7),
        JSON.stringify({
          distance: reply.view.offsetDistance,
          volume: body.volume,
          faces: body.faces.map((f) => ({ thickness: f.thickness, signature: f.signature })),
        }),
      );
      const outer = Math.abs(face.signature[2] - 4 * Math.PI * 16) < 1e-6;
      const expected = ((4 * Math.PI) / 3) * (outer ? 4.25 ** 3 - 3 ** 3 : 4 ** 3 - 2.75 ** 3);
      assert.ok(Math.abs(expected - body.volume) < 1e-6);
      const fixed = hollow.faces.find((f) => f.id !== face.id);
      assert.deepEqual(body.faces.find((f) => f.id === fixed?.id)?.signature, fixed?.signature);
      await owner.call({ kind: "discard" });
      const thinner = await owner.call({
        kind: "offset-faces",
        operation: {
          faces: [{ body: hollow.id, face: face.id }],
          distance: -0.25,
        },
      });
      assert.equal(thinner.error, undefined);
      assert.equal(thinner.view.offsetDistance, -0.25);
      assert.ok(
        thinner.view.candidate?.bodies?.[0].faces.every(
          (f) => Math.abs((f.thickness?.distance ?? 0) - 0.75) < 1e-7,
        ),
      );
      await owner.call({ kind: "discard" });
    }
  } finally {
    owner.close();
  }
});
