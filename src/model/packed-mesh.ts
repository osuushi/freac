import { facetArea, retriangulateCollinear } from "./collinear-facets.js";
import type { ExportMesh } from "./export-mesh.js";

/** Float packing can collapse Boolean slivers. Join short edges within the existing
 * rounding bound, then re-triangulate exact collinearity without moving vertices. */
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
    if (facetArea(mesh, triangle) !== 0) continue;
    const edges = [
      [triangle[0], triangle[1]],
      [triangle[1], triangle[2]],
      [triangle[2], triangle[0]],
    ];
    edges.sort((a, b) => distance(a[0], a[1]) - distance(b[0], b[1]));
    const [a, b] = edges[0];
    if (distance(a, b) > rounding) continue;
    parents[root(b)] = root(a);
  }
  for (let i = 0; i < parents.length; i++)
    if (distance(i, root(i)) > rounding)
      throw new Error("Mesh packing exceeds numerical precision");
  const triangles = mesh.triangles
    .map((triangle) => triangle.map(root))
    .filter((ids) => new Set(ids).size === 3);
  const result = retriangulateCollinear({ vertices: mesh.vertices, triangles }, rounding);
  if (result.triangles.some((triangle) => facetArea(result, triangle) === 0))
    throw new Error("A collapsed mesh facet exceeds numerical precision");
  return result;
}
