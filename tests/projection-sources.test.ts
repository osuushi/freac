import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { featureEdges } from "../src/model/feature-edges.js";
import { bezierAt } from "../src/sketch/bezier-geometry.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { type PlaneFrame, planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { lift, prism, square } from "./body-edge-fixtures.js";

const tilted: PlaneFrame = { origin: [0, 0, 26], u: [Math.sqrt(3) / 2, 0, -0.5], v: [0, 1, 0] };
const circle = (radius: number) => ({
  id: `circle${radius}`,
  kind: "circle" as const,
  center: { x: 0, y: 0 },
  radius,
  construction: false,
});

test("target and source normals give independently expected ellipse axes and centers", async () => {
  const owner = new DocumentOwner();
  try {
    const sketch = { ...emptySketch(planes.XY), curves: [circle(20)] };
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const before = owner.view.data;
    for (const direction of ["target-normal", "source-normal"] as const) {
      const reply = await owner.call({
        kind: "project",
        projection: { sources: [{ kind: "sketch", sketch: sketch.id }], frame: tilted, direction },
      });
      assert.equal(reply.error, undefined);
      const projected = reply.view.candidate?.sketches.at(-1);
      assert.ok(projected);
      const center = direction === "target-normal" ? 13 : 0;
      const rx = direction === "target-normal" ? 10 * Math.sqrt(3) : 40 / Math.sqrt(3);
      for (const c of projected.curves) {
        assert.equal(c.kind, "bezier");
        if (c.kind !== "bezier") continue;
        for (let i = 0; i <= 100; i++) {
          const p = bezierAt(c, i / 100);
          assert.ok(
            Math.abs(Math.hypot((p.x - center) / rx, p.y / 20) - 1) < 0.001 / Math.min(rx, 20),
          );
        }
      }
      assert.ok(Math.abs(profilesFor(projected)[0].area - Math.PI * rx * 20) < 0.08);
      await owner.call({ kind: "discard" });
      assert.deepEqual(owner.view.data, before);
    }
    const parallel = await owner.call({
      kind: "project",
      projection: {
        sources: [{ kind: "sketch", sketch: sketch.id }],
        frame: planes.XZ,
        direction: "source-normal",
      },
    });
    assert.match(parallel.error ?? "", /parallel to the target plane/);
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});

test("region projection retains holes and trimmed spans instead of whole owner curves", async () => {
  const owner = new DocumentOwner();
  try {
    const annulus = { ...emptySketch(planes.XY), curves: [circle(10), circle(4)] };
    assert.equal((await owner.call({ kind: "edit", sketch: annulus })).error, undefined);
    const ring = profilesFor(annulus).find((p) => p.holes.length);
    assert.ok(ring);
    let reply = await owner.call({
      kind: "project",
      projection: {
        sources: [{ kind: "profile", sketch: annulus.id, profile: ring.key }],
        frame: { ...planes.XY, origin: [0, 0, 5] },
      },
    });
    assert.equal(reply.error, undefined);
    let projected = reply.view.candidate?.sketches.at(-1);
    assert.ok(projected);
    assert.equal(projected.curves.length, 2);
    assert.ok(
      profilesFor(projected).some(
        (p) => p.holes.length === 1 && Math.abs(p.area - 84 * Math.PI) < 1e-7,
      ),
    );
    await owner.call({ kind: "discard" });
    const split = {
      ...emptySketch(planes.XY),
      curves: [circle(10), segment({ x: -15, y: 0 }, { x: 15, y: 0 })],
    };
    assert.equal((await owner.call({ kind: "edit", sketch: split })).error, undefined);
    const half = profilesFor(split)[0];
    assert.ok(Math.abs(half.area - 50 * Math.PI) < 1e-7);
    reply = await owner.call({
      kind: "project",
      projection: {
        sources: [{ kind: "profile", sketch: split.id, profile: half.key }],
        frame: { ...planes.XY, origin: [0, 0, 8] },
      },
    });
    assert.equal(reply.error, undefined);
    projected = reply.view.candidate?.sketches.at(-1);
    assert.ok(projected);
    assert.equal(projected.curves.length, 2);
    assert.ok(projected.curves.some((c) => c.kind === "arc"));
    assert.ok(Math.abs(profilesFor(projected)[0].area - 50 * Math.PI) < 1e-7);
  } finally {
    owner.close();
  }
});

test("whole-cylinder and curved-face projection includes the sides without a stored wire", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await lift(owner, { ...emptySketch(planes.XY), curves: [circle(10)] });
    assert.equal(featureEdges(body).length, 2, "Only rims are stored as feature edges");
    const wall = body.faces.find((f) => f.cylinder);
    assert.ok(wall);
    for (const sources of [
      [{ kind: "body" as const, body: body.id }],
      [{ kind: "face" as const, body: body.id, face: wall.id }],
    ]) {
      const reply = await owner.call({
        kind: "project",
        projection: { sources, frame: { ...planes.XZ, origin: [0, 30, 0] } },
      });
      assert.equal(reply.error, undefined);
      const projected = reply.view.candidate?.sketches.at(-1);
      assert.ok(projected);
      assert.equal(projected.curves.length, 4);
      assert.ok(projected.curves.every((c) => c.kind === "segment"));
      assert.equal(profilesFor(projected).length, 1);
      assert.ok(Math.abs(profilesFor(projected)[0].area - 200) < 1e-7);
      await owner.call({ kind: "discard" });
      const unsupported = await owner.call({
        kind: "project",
        projection: { sources, frame: tilted, direction: "source-normal" },
      });
      assert.match(unsupported.error ?? "", /requires planar sources/);
    }
    const reply = await owner.call({
      kind: "project",
      projection: { sources: [{ kind: "body", body: body.id }], frame: tilted },
    });
    assert.equal(reply.error, undefined);
    const projected = reply.view.candidate?.sketches.at(-1);
    assert.ok(projected);
    assert.ok(projected.curves.some((c) => c.kind === "bezier"));
    const filledArea = profilesFor(projected).reduce((sum, p) => sum + p.area, 0);
    assert.ok(Math.abs(filledArea - ((100 * Math.PI * Math.sqrt(3)) / 2 + 100)) < 0.02);
    const sides = projected.curves.filter((c) => c.kind === "segment");
    assert.equal(sides.length, 2);
    for (const side of sides)
      if (side.kind === "segment") {
        assert.ok(Math.abs(Math.abs(side.a.y) - 10) < 1e-7);
        assert.ok(Math.abs(side.a.y - side.b.y) < 1e-7);
        assert.ok(Math.abs(Math.abs(side.a.x - side.b.x) - 5) < 1e-7);
      }
  } finally {
    owner.close();
  }
});

test("whole-body projection omits collapsed implicit edges while explicit point projections reject", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const frame = { ...planes.XY, origin: [0, 0, 30] as [number, number, number] };
    const reply = await owner.call({
      kind: "project",
      projection: { sources: [{ kind: "body", body: body.id }], frame },
    });
    assert.equal(reply.error, undefined);
    const projected = reply.view.candidate?.sketches.at(-1);
    assert.ok(projected);
    assert.equal(projected.curves.length, 4);
    assert.ok(Math.abs(profilesFor(projected)[0].area - 400) < 1e-7);
    await owner.call({ kind: "discard" });
    const edge = body.edges.find(
      (e) =>
        e.curve?.kind === "line" && e.curve.a[0] === e.curve.b[0] && e.curve.a[1] === e.curve.b[1],
    );
    assert.ok(edge);
    const collapsed = await owner.call({
      kind: "project",
      projection: { sources: [{ kind: "edge", body: body.id, edge: edge.id }], frame },
    });
    assert.match(collapsed.error ?? "", /projects to a point/);
  } finally {
    owner.close();
  }
});

test("a sphere with no feature wires still projects its exact circular silhouette", async () => {
  const owner = new DocumentOwner();
  try {
    const sketch: Sketch = {
      ...emptySketch(planes.XZ),
      curves: [
        {
          id: "arc",
          kind: "arc",
          a: { x: 0, y: -4 },
          b: { x: 0, y: 4 },
          bulge: 1,
          construction: false,
        },
        segment({ x: 0, y: 4 }, { x: 0, y: -4 }),
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
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    assert.ok(
      featureEdges(body).every((edge) => edge.curve === null && edge.signature[2] < 1e-7),
      "The sphere has only degenerate pole edges besides its periodic seam",
    );
    const reply = await owner.call({
      kind: "project",
      projection: {
        sources: [{ kind: "body", body: body.id }],
        frame: { ...planes.XY, origin: [0, 0, 10] },
      },
    });
    assert.equal(reply.error, undefined);
    const projected = reply.view.candidate?.sketches.at(-1);
    assert.ok(projected);
    assert.equal(projected.curves.length, 1);
    assert.equal(projected.curves[0].kind, "circle");
    assert.ok(Math.abs(profilesFor(projected)[0].area - 16 * Math.PI) < 1e-7);
  } finally {
    owner.close();
  }
});
