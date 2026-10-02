import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body, Extrusion } from "../src/model/body.js";
import { exportMesh } from "../src/model/export-mesh.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { prism } from "./body-edge-fixtures.js";

const fixture = JSON.parse(
  readFileSync("tests/fixtures/extrude-projected-cylinder.json", "utf8"),
) as { document: SketchDocument; extrusion: Extrusion };
const angle = (35 * Math.PI) / 180;
const cylinderVolume = Math.PI * 16 ** 2 * 24;
const prismVolume = 40 * (Math.PI * 16 ** 2 * Math.cos(angle) + 32 * 24 * Math.sin(angle));
// Independent disk integration: remaining axial length above the horizontal z=40 plane.
const aboveVolume = Array.from({ length: 10000 }, (_, i) => {
  const x = -16 + ((i + 0.5) * 32) / 10000;
  const height = Math.max(0, Math.min(24, 12 - (8 + x * Math.sin(angle)) / Math.cos(angle)));
  return (2 * Math.sqrt(256 - x * x) * height * 32) / 10000;
}).reduce((sum, v) => sum + v, 0);

function checkBody(body: Body, expected: number) {
  assert.ok(Math.abs(body.volume - expected) < 0.25, `${body.volume} != ${expected}`);
  assert.ok(
    exportMesh(body).triangles.length > 0,
    "Export remains closed and consistently oriented",
  );
  let meshVolume = 0;
  for (const face of body.faces) {
    assert.ok(face.vertices.length >= 9, "Every exact face must be displayed");
    for (let i = 0; i < face.vertices.length; i += 9) {
      const [a, b, c, d, e, f, g, h, j] = face.vertices.slice(i, i + 9);
      meshVolume += (a * (e * j - f * h) + b * (f * g - d * j) + c * (d * h - e * g)) / 6;
    }
  }
  assert.ok(
    Math.abs(meshVolume - body.volume) < body.volume * 0.002,
    "Mesh encloses the exact solid",
  );
}

for (const mode of ["auto", "union", "subtract", "intersect", "new"] as const)
  test(`captured cubic extrusion resolves ${mode} with complete geometry and history`, async () => {
    const owner = new DocumentOwner();
    try {
      assert.equal(
        (await owner.call({ kind: "open", document: fixture.document })).error,
        undefined,
      );
      const before = owner.view.data;
      const reply = await owner.call({
        kind: "extrude",
        extrusion: { ...fixture.extrusion, mode },
      });
      assert.equal(reply.error, undefined);
      assert.deepEqual(reply.view.data, before);
      const bodies = reply.view.candidate?.bodies;
      assert.equal(bodies?.length, mode === "new" ? 2 : 1);
      const result = bodies?.at(-1);
      assert.ok(result);
      const expected =
        mode === "new"
          ? prismVolume
          : mode === "union"
            ? prismVolume + aboveVolume
            : mode === "intersect"
              ? cylinderVolume - aboveVolume
              : aboveVolume;
      checkBody(result, expected);
      assert.equal((await owner.call({ kind: "accept" })).error, undefined);
      const accepted = owner.view.data;
      assert.equal((await owner.call({ kind: "undo" })).error, undefined);
      assert.deepEqual(owner.view.data, before);
      assert.equal((await owner.call({ kind: "redo" })).error, undefined);
      assert.deepEqual(owner.view.data, accepted);
      assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
      checkBody(owner.view.data.bodies?.at(-1) as Body, expected);
    } finally {
      owner.close();
    }
  });

test("the original incomplete capture still rejects atomically during Open", async () => {
  const owner = new DocumentOwner();
  try {
    await owner.call({ kind: "open", document: fixture.document });
    const before = owner.view.data;
    const broken: SketchDocument = JSON.parse(
      readFileSync("tests/fixtures/extrude-incomplete-cylinder.json", "utf8"),
    );
    const reply = await owner.call({ kind: "open", document: broken });
    assert.match(reply.error ?? "", /could not mesh every face/);
    assert.deepEqual(reply.view.data, before);
  } finally {
    owner.close();
  }
});

test("saved cubic prisms support standalone Union and subsequent rigid editing", async () => {
  const owner = new DocumentOwner();
  try {
    await owner.call({ kind: "open", document: fixture.document });
    assert.equal(
      (await owner.call({ kind: "extrude", extrusion: { ...fixture.extrusion, mode: "new" } }))
        .error,
      undefined,
    );
    await owner.call({ kind: "accept" });
    assert.equal((await owner.call({ kind: "open", document: owner.view.data })).error, undefined);
    const reply = await owner.call({
      kind: "boolean-bodies",
      operation: {
        ids: (owner.view.data.bodies ?? []).map((b) => b.id),
        mode: "union",
        keepOriginals: false,
      },
    });
    assert.equal(reply.error, undefined);
    await owner.call({ kind: "accept" });
    const before = owner.view.data;
    const body = before.bodies?.[0];
    assert.ok(body);
    checkBody(body, prismVolume + aboveVolume);
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ids: [body.id],
            axis: [0, 1, 0],
            angle: 27,
            pivot: [0, 0, 0],
            translation: [123, -57, 5],
            duplicate: false,
          },
        })
      ).error,
      undefined,
    );
    const moved = owner.view.data.bodies?.[0];
    assert.ok(moved);
    checkBody(moved, prismVolume + aboveVolume);
    assert.deepEqual(
      moved.faces.map((f) => f.id),
      body.faces.map((f) => f.id),
    );
    assert.deepEqual(owner.view.data.sketches, before.sketches);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});

test("analytic-only Boolean operands preserve gaps smaller than the cubic budget", async () => {
  const owner = new DocumentOwner();
  try {
    const a = await prism(owner, [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    const b = await prism(owner, [
      [10.00005, 0],
      [20, 0],
      [20, 10],
      [10.00005, 10],
    ]);
    const reply = await owner.call({
      kind: "boolean-bodies",
      operation: { ids: [a.id, b.id], mode: "union", keepOriginals: false },
    });
    assert.equal(reply.error, undefined);
    assert.equal(reply.view.candidate?.bodies?.length, 2);
    assert.ok(
      Math.abs(
        (reply.view.candidate?.bodies?.reduce((sum, b) => sum + b.volume, 0) ?? 0) - 1999.995,
      ) < 1e-7,
    );
  } finally {
    owner.close();
  }
});
