import assert from "node:assert/strict";
import test from "node:test";
import type { SketchResult, SolidResult } from "../src/agent-script/api.js";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import type { PathSegment } from "../src/model/path-sweep.js";

const curved: PathSegment[] = [
  { kind: "bezier", a: [0, 0, 0], c1: [0, 0, 10], c2: [10, 0, 20], b: [10, 10, 30] },
];
async function circle(owner: DocumentOwner, hole = false) {
  return (await owner.scripts.step({
    kind: "createSketch",
    input: {
      plane: "XY",
      curves: [
        { kind: "circle", center: { x: 0, y: 0 }, radius: 1 },
        ...(hole ? [{ kind: "circle" as const, center: { x: 0, y: 0 }, radius: 0.5 }] : []),
      ],
    },
  })) as SketchResult;
}
function length() {
  let sum = 0;
  const n = 10000;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    sum += (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * Math.hypot(60 * t * (1 - t), 30 * t * t, 30);
  }
  return sum / (3 * n);
}
for (const hollow of [false, true])
  test(`nonplanar ${hollow ? "hollow" : "solid"} agent sweep preserves section, volume and history`, async () => {
    const owner = new DocumentOwner();
    try {
      const original = owner.view.data;
      owner.beginScript("sweep.ts");
      const sketch = await circle(owner, hollow);
      // Annulus is the first region with an outer radius of 1; kernel handles its hole.
      const result = (await owner.scripts.step({
        kind: "sweep",
        input: { sources: [sketch.profiles[0]], path: curved, mode: "new" },
      })) as SolidResult;
      assert.equal(result.bodies.length, 1);
      const expected = Math.PI * (hollow ? 0.75 : 1) * length();
      assert.ok(
        Math.abs(result.bodies[0].volume - expected) < 0.002,
        `${result.bodies[0].volume} vs ${expected}`,
      );
      assert.equal(owner.view.data, original);
      owner.scripts.finish();
      const accepted = owner.view.data,
        body = accepted.bodies?.[0];
      assert(body);
      const caps = body.faces.filter((f) => f.plane);
      assert.equal(caps.length, 2);
      assert(caps.some((f) => f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v) < 1e-5)));
      assert(
        caps.some((f) => {
          for (let i = 0; i < f.vertices.length; i += 3)
            if (Math.abs(f.vertices[i + 1] + f.vertices[i + 2] - 40) > 1e-4) return false;
          return true;
        }),
      );
      await owner.call({ kind: "undo" });
      assert.equal(owner.view.data, original);
      await owner.call({ kind: "redo" });
      assert.equal(owner.view.data, accepted);
      assert.equal(
        (
          await owner.call({
            kind: "open",
            document: readArchive(documentArchive(accepted)),
          })
        ).error,
        undefined,
      );
    } finally {
      owner.close();
    }
  });
test("connected line/Bézier paths and explicit Boolean targets", async () => {
  const owner = new DocumentOwner();
  try {
    owner.beginScript("cut.ts");
    const s = await circle(owner);
    const base = (await owner.scripts.step({
      kind: "extrude",
      input: { sources: s.profiles, distance: 10, mode: "new" },
    })) as SolidResult;
    const cutter = (await owner.scripts.step({
      kind: "createSketch",
      input: { plane: "XY", curves: [{ kind: "circle", center: { x: 0, y: 0 }, radius: 0.5 }] },
    })) as SketchResult;
    const cut = (await owner.scripts.step({
      kind: "sweep",
      input: {
        sources: cutter.profiles,
        path: [
          { kind: "line", a: [0, 0, 0], b: [0, 0, 5] },
          { kind: "bezier", a: [0, 0, 5], c1: [0, 0, 6], c2: [0, 0, 9], b: [0, 0, 10] },
        ],
        mode: "subtract",
        targets: [base.bodies[0].id],
      },
    })) as SolidResult;
    assert.equal(cut.bodies.length, 1);
    assert.ok(Math.abs(cut.bodies[0].volume - 7.5 * Math.PI) < 1e-5);
    owner.scripts.finish();
  } finally {
    owner.close();
  }
});
test("invalid paths fail atomically and preserve Redo", async () => {
  const owner = new DocumentOwner();
  try {
    owner.beginScript("seed.ts");
    await circle(owner);
    owner.scripts.finish();
    await owner.call({ kind: "undo" });
    const original = owner.view.data;
    const invalid: PathSegment[][] = [
      [],
      [{ kind: "line", a: [0, 0, 0], b: [0, 0, 0] }],
      [{ kind: "line", a: [0, 0, 0], b: [10, 0, 0] }],
      [{ kind: "line", a: [0, 0, 2], b: [0, 0, 10] }],
      [
        { kind: "line", a: [0, 0, 0], b: [0, 0, 5] },
        { kind: "line", a: [0, 0, 6], b: [0, 0, 10] },
      ],
      [
        { kind: "line", a: [0, 0, 0], b: [0, 0, 5] },
        { kind: "line", a: [0, 0, 5], b: [10, 0, 5] },
      ],
      [{ kind: "bezier", a: [0, 0, 0], c1: [0, 0, 0], c2: [1, 2, 3], b: [4, 5, 6] }],
    ];
    for (const path of invalid) {
      owner.beginScript("bad-path.ts");
      const s = await circle(owner);
      await assert.rejects(() =>
        owner.scripts.step({ kind: "sweep", input: { sources: s.profiles, path, mode: "new" } }),
      );
      await owner.scripts.cancel("bad path");
      assert.equal(owner.view.data, original);
      assert(owner.view.canRedo);
    }
  } finally {
    owner.close();
  }
});

test("closed smooth paths work, overlapping swept material rejects", async () => {
  const owner = new DocumentOwner();
  try {
    for (const radius of [10, 0.5]) {
      owner.beginScript("closed.ts");
      const s = (await owner.scripts.step({
        kind: "createSketch",
        input: {
          plane: "XZ",
          curves: [{ kind: "circle", center: { x: radius, y: 0 }, radius: 1 }],
        },
      })) as SketchResult;
      const k = (4 * (Math.SQRT2 - 1)) / 3,
        r = radius;
      const path: PathSegment[] = [
        { kind: "bezier", a: [r, 0, 0], c1: [r, k * r, 0], c2: [k * r, r, 0], b: [0, r, 0] },
        { kind: "bezier", a: [0, r, 0], c1: [-k * r, r, 0], c2: [-r, k * r, 0], b: [-r, 0, 0] },
        { kind: "bezier", a: [-r, 0, 0], c1: [-r, -k * r, 0], c2: [-k * r, -r, 0], b: [0, -r, 0] },
        { kind: "bezier", a: [0, -r, 0], c1: [k * r, -r, 0], c2: [r, -k * r, 0], b: [r, 0, 0] },
      ];
      const operation = () =>
        owner.scripts.step({ kind: "sweep", input: { sources: s.profiles, path, mode: "new" } });
      if (radius === 10) {
        const result = (await operation()) as SolidResult;
        assert.equal(result.bodies.length, 1);
        assert.ok(Math.abs(result.bodies[0].volume - 20 * Math.PI * Math.PI) < 0.1);
      } else await assert.rejects(operation);
      await owner.scripts.cancel();
      assert.equal(owner.view.data.bodies?.length ?? 0, 0);
    }
  } finally {
    owner.close();
  }
});

test("existing planar face can seed a sweep without moving its body", async () => {
  const owner = new DocumentOwner();
  try {
    owner.beginScript("base.ts");
    const s = await circle(owner);
    await owner.scripts.step({
      kind: "extrude",
      input: { sources: s.profiles, distance: 5, mode: "new" },
    });
    owner.scripts.finish();
    const body = owner.view.data.bodies?.[0];
    assert(body);
    const cap = body.faces.find(
      (f) => f.plane && f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 5) < 1e-7),
    );
    assert(cap);
    owner.beginScript("face-path.ts");
    const result = (await owner.scripts.step({
      kind: "sweep",
      input: {
        sources: [{ face: cap.id }],
        path: [{ kind: "line", a: [0, 0, 5], b: [0, 0, 8] }],
        mode: "new",
      },
    })) as SolidResult;
    assert.equal(result.bodies.length, 2);
    const swept = result.bodies.find((b) => b.id !== body.id);
    assert(swept);
    assert.ok(Math.abs(swept.volume - 3 * Math.PI) < 1e-6);
    owner.scripts.finish();
    assert.deepEqual(
      owner.view.data.bodies?.find((b) => b.id === body.id),
      body,
    );
  } finally {
    owner.close();
  }
});
