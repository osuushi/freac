import assert from "node:assert/strict";
import test from "node:test";
import { bezierSpan } from "../src/sketch/bezier-geometry.js";
import { type Bezier, type Circle, newId } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { spanCurve, trimAt, trimSpans } from "../src/sketch/trim-geometry.js";

test("intersection-only trim skips collinear endpoints but retains crossing and T contacts", () => {
  const source = segment({ x: -10, y: 0 }, { x: 10, y: 0 });
  const others = [
    segment({ x: -4, y: 0 }, { x: 4, y: 0 }),
    segment({ x: -6, y: -5 }, { x: -6, y: 5 }),
    segment({ x: 6, y: 0 }, { x: 6, y: 5 }),
  ];
  const p = { x: 5, y: 0 };
  assert.deepEqual(trimAt(source, others, p), { curve: source, start: 0.7, end: 0.8 });
  assert.deepEqual(trimAt(source, others, p, true), { curve: source, start: 0.2, end: 0.8 });
  assert.equal(trimSpans(source, [others[0]], true).length, 1);
});

test("intersection-only circular trim ignores coincident arc endpoints, preserving real contacts", () => {
  const source: Circle = {
    id: newId(),
    kind: "circle",
    center: { x: 0, y: 0 },
    radius: 5,
    construction: false,
  };
  const overlap = spanCurve({ curve: source, start: 0.125, end: 0.375 }, newId());
  const crossing = segment({ x: -10, y: 0 }, { x: 10, y: 0 });
  assert.equal(trimSpans(source, [overlap]).length, 2);
  assert.deepEqual(trimSpans(source, [overlap], true), [{ curve: source, start: 0, end: 1 }]);
  assert.deepEqual(trimAt(source, [overlap, crossing], { x: 0, y: 5 }, true), {
    curve: source,
    start: 0,
    end: 0.5,
  });
  assert.deepEqual(trimSpans(overlap, [source], true), [{ curve: overlap, start: 0, end: 1 }]);
});

test("intersection-only cubic trim skips overlap ends while keeping a crossing", () => {
  const source: Bezier = {
    id: newId(),
    kind: "bezier",
    construction: false,
    a: { x: -10, y: 0 },
    c1: { x: -5, y: 10 },
    c2: { x: 5, y: -10 },
    b: { x: 10, y: 0 },
  };
  const overlap = { ...bezierSpan(source, 0.25, 0.75), id: newId() };
  const crossing = segment({ x: 0, y: -10 }, { x: 0, y: 10 });
  assert.equal(trimSpans(source, [overlap]).length, 3);
  assert.deepEqual(trimSpans(source, [overlap], true), [{ curve: source, start: 0, end: 1 }]);
  const spans = trimSpans(source, [overlap, crossing], true);
  assert.equal(spans.length, 2);
  assert.ok(Math.abs(spans[0].end - 0.5) < 1e-7);
});
