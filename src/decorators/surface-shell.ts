import type { ExportMesh } from "../model/export-mesh.js";

/** Close corresponding oriented surface meshes along their boundary edges. */
export function surfaceShell(
  inner: number[][],
  outer: number[][],
  triangles: readonly number[][],
): ExportMesh {
  const count = inner.length,
    result: number[][] = [];
  const edges = new Map<string, { a: number; b: number; count: number }>();
  for (const [a, b, c] of triangles) {
    result.push([c, b, a], [a + count, b + count, c + count]);
    for (const [x, y] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = x < y ? `${x}/${y}` : `${y}/${x}`;
      const edge = edges.get(key);
      if (edge) edge.count++;
      else edges.set(key, { a: x, b: y, count: 1 });
    }
  }
  for (const { a, b, count: occurrences } of edges.values())
    if (occurrences === 1) result.push([a, b, b + count], [a, b + count, a + count]);
  return { vertices: [...inner, ...outer], triangles: result };
}
