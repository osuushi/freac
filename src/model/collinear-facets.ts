import type { ExportMesh } from "./export-mesh.js";

export function facetArea(mesh: ExportMesh, triangle: number[]): number {
  const [a, b, c] = triangle.map((i) => mesh.vertices[i]);
  const u = b.map((v, i) => v - a[i]),
    v = c.map((n, i) => n - a[i]);
  return Math.hypot(
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  );
}
const edges = ([a, b, c]: number[]) => [
  [a, b],
  [b, c],
  [c, a],
];

/** An exactly collinear facet can be absorbed by splitting its neighbor at the
 * existing middle vertex. No vertices move and the represented surface is unchanged. */
export function retriangulateCollinear(mesh: ExportMesh, rounding: number): ExportMesh {
  const distance = (a: number, b: number) =>
    Math.hypot(...mesh.vertices[a].map((v, i) => v - mesh.vertices[b][i]));
  const pending = new Set(
    mesh.triangles.flatMap((t, i) =>
      facetArea(mesh, t) === 0 && edges(t).every(([a, b]) => distance(a, b) > rounding) ? [i] : [],
    ),
  );
  if (!pending.size) return mesh;
  const triangles = [...mesh.triangles];
  const adjacency = new Map<string, number>();
  const register = (i: number) => {
    for (const [a, b] of edges(triangles[i])) adjacency.set(`${a}/${b}`, i);
  };
  for (let i = 0; i < triangles.length; i++) register(i);
  let changed = true;
  while (changed && pending.size) {
    changed = false;
    for (const i of pending) {
      const [a, b] = edges(triangles[i]).sort(
        (x, y) => distance(y[0], y[1]) - distance(x[0], x[1]),
      )[0];
      const c = triangles[i].find((v) => v !== a && v !== b);
      const neighbor = adjacency.get(`${b}/${a}`);
      if (c === undefined || neighbor === undefined || neighbor === i) continue;
      const d = triangles[neighbor].find((v) => v !== a && v !== b);
      if (d === undefined || d === c || adjacency.has(`${c}/${d}`) || adjacency.has(`${d}/${c}`))
        continue;
      const replacement = [
        [c, a, d],
        [c, d, b],
      ];
      if (!replacement.every((t) => facetArea(mesh, t) > 0)) continue;
      for (const index of [i, neighbor])
        for (const [x, y] of edges(triangles[index])) adjacency.delete(`${x}/${y}`);
      [triangles[i], triangles[neighbor]] = replacement;
      register(i);
      register(neighbor);
      pending.delete(i);
      pending.delete(neighbor);
      changed = true;
    }
  }
  return { ...mesh, triangles };
}
