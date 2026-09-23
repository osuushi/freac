import assert from "node:assert/strict";
import test from "node:test";
import { cubeSurfaces } from "../src/sketch/orientation-cube-geometry.js";

test("beveled cube is closed with planar surfaces for all 26 canonical directions", () => {
  const surfaces = cubeSurfaces();
  assert.equal(surfaces.filter((s) => s.kind === "face").length, 6);
  assert.equal(surfaces.filter((s) => s.kind === "edge").length, 12);
  assert.equal(surfaces.filter((s) => s.kind === "corner").length, 8);
  const edges = new Map<string, number>();
  const directions = new Set<string>();
  for (const surface of surfaces) {
    assert.ok(Math.abs(surface.normal.length() - 1) < 1e-12);
    assert.ok(surface.up.clone().cross(surface.normal).length() > 0.5);
    const plane = surface.vertices[0].dot(surface.normal);
    assert.ok(plane > 0);
    directions.add(
      surface.normal
        .toArray()
        .map((v) => Math.sign(v))
        .join(","),
    );
    surface.vertices.forEach((v, i) => {
      assert.ok(Math.abs(v.dot(surface.normal) - plane) < 1e-12);
      const next = surface.vertices[(i + 1) % surface.vertices.length];
      const key = [v.toArray().join(","), next.toArray().join(",")].sort().join(";");
      edges.set(key, (edges.get(key) ?? 0) + 1);
    });
  }
  assert.equal(directions.size, 26);
  assert.equal(edges.size, 48);
  for (const count of edges.values()) assert.equal(count, 2, "Each edge joins two surfaces");
});
