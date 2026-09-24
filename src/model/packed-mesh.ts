import type { ExportMesh } from "./export-mesh.js";

function area(mesh: ExportMesh, triangle: number[]): number {
  const [a, b, c] = triangle.map((i) => mesh.vertices[i]);
  const u = b.map((v, i) => v - a[i]),
    v = c.map((n, i) => n - a[i]);
  return Math.hypot(
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  );
}

/** Float packing can collapse Boolean slivers. Collapse only their short edges,
 * within the Boolean result's existing rounding bound; never increase a weld tolerance. */
export function packedMesh(mesh: ExportMesh, rounding: number): ExportMesh {
  const parents = mesh.vertices.map((_, i) => i);
  const root = (i: number): number => {
    let current = i;
    while (parents[current] !== current) current = parents[current];
    while (parents[i] !== i) {
      const next = parents[i];
      parents[i] = current;
      i = next;
    }
    return current;
  };
  const distance = (a: number, b: number) =>
    Math.hypot(...mesh.vertices[a].map((v, i) => v - mesh.vertices[b][i]));
  for (const triangle of mesh.triangles) {
    if (area(mesh, triangle) !== 0) continue;
    const edges = [
      [triangle[0], triangle[1]],
      [triangle[1], triangle[2]],
      [triangle[2], triangle[0]],
    ];
    edges.sort((a, b) => distance(a[0], a[1]) - distance(b[0], b[1]));
    const [a, b] = edges[0];
    if (distance(a, b) > rounding)
      throw new Error("A collapsed mesh facet exceeds numerical precision");
    parents[root(b)] = root(a);
  }
  for (let i = 0; i < parents.length; i++)
    if (distance(i, root(i)) > rounding)
      throw new Error("Mesh packing exceeds numerical precision");
  const triangles = mesh.triangles
    .map((triangle) => triangle.map(root))
    .filter((ids) => new Set(ids).size === 3);
  return { vertices: mesh.vertices, triangles };
}
