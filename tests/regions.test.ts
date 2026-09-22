import assert from "node:assert/strict";
import test from "node:test";
import { ShapeUtils, Vector2 } from "three";
import { segment } from "../src/sketch/geometry.js";
import { closedCells, signedArea } from "../src/sketch/regions.js";

const edge = (a: number[], b: number[]) =>
  segment({ x: a[0] ?? 0, y: a[1] ?? 0 }, { x: b[0] ?? 0, y: b[1] ?? 0 });
const path = (points: number[][]) => points.slice(1).map((p, i) => edge(points[i] ?? [], p));
const square = path([
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
  [0, 0],
]);
function areas(curves: ReturnType<typeof edge>[]) {
  return closedCells(curves)
    .map((cell) => {
      const triangles = ShapeUtils.triangulateShape(
        cell.map((p) => new Vector2(p.x, p.y)),
        [],
      );
      const triangulated = triangles.reduce(
        (area, ids) =>
          area + Math.abs(signedArea(ids.map((i) => cell[i]).filter((p) => p !== undefined))),
        0,
      );
      assert.ok(
        Math.abs(triangulated - signedArea(cell)) < 1e-8,
        "Actual fill triangles cover the cell",
      );
      return signedArea(cell);
    })
    .sort((a, b) => a - b);
}
test("independent segments close by coordinates, while gaps and construction leave outlines", () => {
  assert.deepEqual(areas(square), [100]);
  assert.deepEqual(areas(square.slice(0, 3)), []);
  assert.deepEqual(areas([...square.slice(0, 3), edge([0, 10], [0, 0.001])]), []);
  assert.deepEqual(areas(square.map((s, i) => ({ ...s, construction: i === 0 }))), []);
  assert.deepEqual(areas(square.map((s) => ({ ...s, a: s.b, b: s.a })).reverse()), [100]);
});
test("concave and crossing boundaries triangulate into bounded cells", () => {
  assert.deepEqual(
    areas(
      path([
        [0, 0],
        [10, 0],
        [10, 5],
        [5, 5],
        [5, 10],
        [0, 10],
        [0, 0],
      ]),
    ),
    [75],
  );
  assert.deepEqual(areas([...square, edge([-5, 5], [15, 5])]), [50, 50]);
  assert.deepEqual(
    areas(
      path([
        [0, 0],
        [10, 10],
        [0, 10],
        [10, 0],
        [0, 0],
      ]),
    ),
    [25, 25],
  );
});
test("tails, duplicate and partially overlapping edges do not invent or destroy fill", () => {
  assert.deepEqual(areas([...square, edge([0, 0], [3, 3])]), [100]);
  assert.deepEqual(areas([...square, edge([0, 0], [-3, -3])]), [100]);
  assert.deepEqual(areas([...square, edge([0, 0], [10, 0]), edge([3, 0], [12, 0])]), [100]);
});
test("nested and disjoint loops are derived without changing the original curves", () => {
  const curves = [
    ...square,
    ...path([
      [2, 2],
      [4, 2],
      [4, 4],
      [2, 4],
      [2, 2],
    ]),
    ...path([
      [20, 0],
      [30, 0],
      [30, 10],
      [20, 10],
      [20, 0],
    ]),
  ];
  const before = structuredClone(curves);
  assert.deepEqual(areas(curves), [4, 100, 100]);
  assert.deepEqual(curves, before);
});
