import assert from "node:assert/strict";
import test from "node:test";
import { shadowSection } from "../src/model/shadow-section.js";
import type { Vector } from "../src/sketch/planes.js";

test("Sections use actual contact, not the projected silhouette, on every world plane", () => {
  for (const normal of [0, 1, 2]) {
    const axes = [0, 1, 2].filter((axis) => axis !== normal);
    const point = (height: number, x: number, y: number): Vector => {
      const p: Vector = [0, 0, 0];
      p[normal] = height;
      p[axes[0]] = x;
      p[axes[1]] = y;
      return p;
    };
    const geometry = { triangles: [[point(-2, 0, 0), point(2, 4, 0), point(2, 0, 4)]], lines: [] };
    const before = structuredClone(geometry);
    assert.deepEqual(shadowSection(geometry, normal), {
      triangles: [],
      lines: [[point(0, 2, 0), point(0, 0, 2)]],
    });
    assert.deepEqual(geometry, before);
    assert.equal(
      shadowSection(
        { triangles: [[point(1, 0, 0), point(2, 4, 0), point(2, 0, 4)]], lines: [] },
        normal,
      ),
      null,
    );
  }
});

test("Contact includes coplanar faces, tangent edges and tangent points", () => {
  const a: Vector = [0, 0, 0],
    b: Vector = [4, 0, 0],
    c: Vector = [0, 4, 0];
  assert.deepEqual(shadowSection({ triangles: [[a, b, c]], lines: [] }, 2), {
    triangles: [[a, b, c]],
    lines: [[a, b, c, a]],
  });
  assert.deepEqual(shadowSection({ triangles: [[a, b, [0, 4, 3]]], lines: [] }, 2)?.lines, [
    [a, b],
  ]);
  assert.deepEqual(shadowSection({ triangles: [[a, [4, 0, 3], [0, 4, 3]]], lines: [] }, 2)?.lines, [
    [a, a],
  ]);
  assert.equal(shadowSection({ triangles: [], lines: [[a, b]] }, 2), null);
});
