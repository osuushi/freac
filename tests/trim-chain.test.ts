import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Sketch } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { trimChain } from "../src/sketch/trim-chain.js";
import { trimOverlappingSketch } from "../src/sketch/trim-edit.js";
import { trimAt, trimPoint } from "../src/sketch/trim-geometry.js";

const fixture = JSON.parse(
  readFileSync("tests/fixtures/trim-projected-ovals.json", "utf8"),
) as Sketch;

test("captured projected ovals trim through cubic joins to both real intersections, one Undo", async () => {
  const seed = trimAt(fixture.curves[42], fixture.curves, { x: -4.8, y: 23 }, true);
  const spans = trimChain(seed, fixture.curves);
  assert.deepEqual(
    spans.map((s) => fixture.curves.indexOf(s.curve)).sort((a, b) => a - b),
    [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47],
  );
  for (const span of spans) {
    for (const t of [span.start, span.end]) {
      const p = trimPoint(span.curve, t);
      assert.ok(
        p.x <= 1e-6,
        "No highlighted part may cross to the outside of the left-facing oval",
      );
      assert.ok(p.y > 13 && p.y < 35);
    }
  }
  const result = trimOverlappingSketch(fixture, spans).sketch;
  assert.equal(result.curves.length, 44);
  for (const c of fixture.curves.filter((_, i) => i < 36 || i > 47)) {
    assert.deepEqual(
      result.curves.find((r) => r.id === c.id),
      c,
    );
  }
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: fixture })).error, undefined);
    const before = owner.view.data;
    assert.equal((await owner.call({ kind: "edit", sketch: result })).error, undefined);
    const after = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, after);
  } finally {
    owner.close();
  }
});

test("chain trim crosses reversed degree-two joins but stops at a branch or edge interior", () => {
  const a = segment({ x: 0, y: 0 }, { x: 2, y: 0 });
  const b = segment({ x: 4, y: 0 }, { x: 2, y: 0 });
  const c = segment({ x: 4, y: 0 }, { x: 6, y: 0 });
  const branch = segment({ x: 4, y: 0 }, { x: 4, y: 2 });
  const curves = [a, b, c, branch];
  assert.deepEqual(
    trimChain(trimAt(a, curves, { x: 1, y: 0 }, true), curves).map((s) => s.curve.id),
    [a.id, b.id],
  );
  const crossing = segment({ x: 3, y: -1 }, { x: 3, y: 1 });
  const chain = trimChain(trimAt(a, [...curves, crossing], { x: 1, y: 0 }, true), [
    ...curves,
    crossing,
  ]);
  assert.equal(chain.length, 2);
  assert.equal(chain[1].start, 0.5);
});

test("an uninterrupted closed chain terminates and trims once without dangling links", () => {
  const curves = [
    segment({ x: 0, y: 0 }, { x: 4, y: 0 }),
    segment({ x: 4, y: 0 }, { x: 2, y: 3 }),
    segment({ x: 2, y: 3 }, { x: 0, y: 0 }),
  ];
  const spans = trimChain(trimAt(curves[0], curves, { x: 2, y: 0 }, true), curves);
  assert.equal(spans.length, 3);
  assert.equal(
    trimOverlappingSketch({ ...fixture, curves, constraints: [], groups: [] }, spans).sketch.curves
      .length,
    0,
  );
});
