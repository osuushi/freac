import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { scaleSketch } from "../src/backend/scale-sketch.js";
import type { Edge } from "../src/model/body.js";
import type { ScaleOperation } from "../src/model/scale.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { planes, worldPoint } from "../src/sketch/planes.js";
import { lift, prism, square } from "./body-edge-fixtures.js";
import { atHeight } from "./edge-movement-fixtures.js";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
function drawing(): Sketch {
  return {
    ...emptySketch(planes.XZ),
    curves: [
      { id: "l", kind: "segment", a: { x: 1, y: 2 }, b: { x: 4, y: 2 }, construction: true },
      { id: "c", kind: "circle", center: { x: 6, y: 7 }, radius: 2, construction: false },
      { id: "a", kind: "arc", a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, bulge: 1, construction: false },
      {
        id: "b",
        kind: "bezier",
        a: { x: 0, y: 5 },
        b: { x: 6, y: 5 },
        c1: { x: 1, y: 8 },
        c2: { x: 4, y: 9 },
        construction: false,
      },
    ],
  };
}
test("Scale exact curve types about off-center pivot; locks reject instead of deforming", () => {
  const sketch = drawing();
  const operation: ScaleOperation = {
    kind: "curves",
    sketchId: sketch.id,
    ids: sketch.curves.map((c) => c.id),
    pivot: [1, 0, 2],
    factor: 2,
  };
  const next = scaleSketch(sketch, operation);
  assert.deepEqual(next.curves[0], { ...sketch.curves[0], a: { x: 1, y: 2 }, b: { x: 7, y: 2 } });
  assert.deepEqual(next.curves[1], { ...sketch.curves[1], center: { x: 11, y: 12 }, radius: 4 });
  assert.deepEqual(next.curves[2], {
    ...sketch.curves[2],
    a: { x: -1, y: -2 },
    b: { x: 3, y: -2 },
  });
  assert.deepEqual(next.curves[3], {
    ...sketch.curves[3],
    a: { x: -1, y: 8 },
    b: { x: 11, y: 8 },
    c1: { x: 1, y: 14 },
    c2: { x: 7, y: 16 },
  });
  assert.throws(
    () =>
      scaleSketch(
        { ...sketch, constraints: [{ id: "lock", kind: "radius", curve: "c", value: 2 }] },
        operation,
      ),
    /constraints/,
  );
  const whole = scaleSketch(sketch, {
    kind: "sketches",
    ids: [sketch.id],
    pivot: [3, 4, 5],
    factor: 2,
  });
  assert.deepEqual(whole.plane.origin, [-3, -4, -5]);
  assert.deepEqual(whole.plane.u, sketch.plane.u);
  const line = whole.curves[0];
  assert.equal(line.kind, "segment");
  if (line.kind === "segment") assert.deepEqual(worldPoint(whole.plane, line.a), [-1, -4, -1]);
});
test("Scale body exact bounds/volume/identity, preview, history, no-op and invalid recovery", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square),
      before = owner.view.data;
    const operation: ScaleOperation = {
      kind: "solids",
      ids: [body.id],
      faces: [],
      edges: [],
      pivot: [1, 2, 3],
      factor: 2,
    };
    assert.equal((await owner.call({ kind: "scale", operation })).error, undefined);
    assert.deepEqual(owner.view.data, before);
    const next = owner.view.candidate?.bodies?.[0];
    assert.ok(next);
    close(next.volume, body.volume * 8);
    next.bounds.forEach((x, i) => {
      close(x, [-1, -2, -3, 39, 38, 17][i]);
    });
    assert.deepEqual(
      next.faces.map((f) => f.id),
      body.faces.map((f) => f.id),
    );
    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    assert.equal(
      (await owner.call({ kind: "scale", operation: { ...operation, factor: 1 } })).error,
      undefined,
    );
    await owner.call({ kind: "accept" });
    assert.equal(owner.view.canRedo, true);
    for (const factor of [0, -1, NaN, Infinity])
      assert.ok((await owner.call({ kind: "scale", operation: { ...operation, factor } })).error);
    assert.equal(owner.view.canRedo, true);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    assert.equal(
      (await owner.call({ kind: "scale", operation: { ...operation, factor: 0.5 } })).error,
      undefined,
    );
    close(owner.view.candidate?.bodies?.[0].volume ?? 0, body.volume);
  } finally {
    owner.close();
  }
});
for (const round of [false, true])
  for (const target of ["face", "rim", "edge"] as const) {
    if (round && target === "edge") continue;
    test(`Scale ${round ? "cylinder" : "box"} ${target} reconnects taper, fixes base and retains topology`, async () => {
      const owner = new DocumentOwner();
      try {
        const body = round
          ? await lift(owner, {
              ...emptySketch(planes.XY),
              curves: [
                { id: "c", kind: "circle", center: { x: 0, y: 0 }, radius: 5, construction: false },
              ],
            })
          : await prism(owner, square);
        const cap = body.faces.find((f) =>
          f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 10) < 1e-6),
        );
        assert.ok(cap);
        const base = atHeight(body, 0),
          rim = atHeight(body, 10);
        const operation: ScaleOperation = {
          kind: "solids",
          ids: [],
          faces: target === "face" ? [{ body: body.id, face: cap.id }] : [],
          edges:
            target === "face"
              ? []
              : (target === "edge" ? rim.slice(0, 1) : rim).map((e) => ({
                  body: body.id,
                  edge: e.id,
                })),
          pivot: round ? [0, 0, 10] : [10, 10, 10],
          factor: 0.7,
        };
        const reply = await owner.call({ kind: "scale", operation });
        assert.equal(reply.error, undefined);
        const next = reply.view.candidate?.bodies?.[0];
        assert.ok(next);
        assert.deepEqual(next.faces.map((f) => f.id).sort(), body.faces.map((f) => f.id).sort());
        assert.deepEqual(next.edges.map((e) => e.id).sort(), body.edges.map((e) => e.id).sort());
        for (const edge of base) {
          const after: Edge | undefined = next.edges.find((e) => e.id === edge.id);
          assert.ok(after);
          assert.deepEqual(after.curve, edge.curve, "opposite base stays fixed");
        }
        if (target !== "edge") close(next.volume, (body.volume * (1 + 0.7 + 0.49)) / 3);
        await owner.call({ kind: "accept" });
        const accepted = owner.view.data;
        assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
        assert.equal(
          (await owner.call({ kind: "scale", operation: { ...operation, factor: 1 / 0.7 } })).error,
          undefined,
        );
        close(owner.view.candidate?.bodies?.[0].volume ?? 0, body.volume);
      } finally {
        owner.close();
      }
    });
  }

test("Scale validates identity targets and scales mixed body/component sources atomically", async () => {
  const owner = new DocumentOwner();
  try {
    const first = await prism(owner, square);
    const second = await prism(
      owner,
      square.map(([x, y]) => [x + 40, y]),
    );
    const before = owner.view.data;
    const face = second.faces.find((f) =>
      f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 10) < 1e-6),
    );
    assert.ok(face);
    const operation: ScaleOperation = {
      kind: "solids",
      ids: [first.id],
      faces: [{ body: second.id, face: face.id }],
      edges: [],
      pivot: [50, 10, 10],
      factor: 0.8,
    };
    assert.equal((await owner.call({ kind: "scale", operation })).error, undefined);
    assert.deepEqual(owner.view.data, before);
    close(owner.view.candidate?.bodies?.[0].volume ?? 0, first.volume * 0.8 ** 3);
    close(owner.view.candidate?.bodies?.[1].volume ?? 0, (second.volume * (1 + 0.8 + 0.64)) / 3);
    await owner.call({ kind: "cancel-preview" });
    for (const factor of [1, 2]) {
      const invalid = { ...operation, factor, faces: [{ body: second.id, face: "missing" }] };
      assert.ok((await owner.call({ kind: "scale", operation: invalid })).error);
      assert.equal(owner.view.candidate, null);
      assert.deepEqual(owner.view.data, before);
    }
  } finally {
    owner.close();
  }
});

test("Whole sketch Scale preview changes plane origin but rejects any locked member atomically", async () => {
  const owner = new DocumentOwner();
  try {
    const a = drawing();
    const b: Sketch = {
      ...emptySketch(planes.YZ),
      curves: [
        { id: "locked", kind: "circle", center: { x: 4, y: 5 }, radius: 2, construction: false },
      ],
      constraints: [{ id: "lock", kind: "radius", curve: "locked", value: 2 }],
    };
    await owner.call({ kind: "edit", sketch: a });
    await owner.call({ kind: "edit", sketch: b });
    const before = owner.view.data;
    const operation: ScaleOperation = {
      kind: "sketches",
      ids: [a.id, b.id],
      pivot: [3, 4, 5],
      factor: 2,
    };
    assert.ok((await owner.call({ kind: "scale", operation })).error);
    assert.deepEqual(owner.view.data, before);
    assert.equal(owner.view.candidate, null);
    const reply = await owner.call({ kind: "scale", operation: { ...operation, ids: [a.id] } });
    assert.equal(reply.error, undefined);
    assert.deepEqual(reply.view.candidate?.sketches[0].plane.origin, [-3, -4, -5]);
    assert.deepEqual(reply.view.candidate?.sketches[1], b);
  } finally {
    owner.close();
  }
});
