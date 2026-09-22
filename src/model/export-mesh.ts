import type { Body } from "./body.js";

export interface ExportMesh {
  vertices: number[][];
  triangles: number[][];
}

// Below kernel modeling tolerance; spatial neighbors avoid rounding-bin seams.
const tolerance = 1e-7;
export function exportMesh(body: Body): ExportMesh {
  const vertices: number[][] = [],
    triangles: number[][] = [];
  const buckets = new Map<string, number[]>();
  const vertex = (point: number[]): number => {
    if (!point.every(Number.isFinite)) throw new Error("Mesh contains invalid coordinates");
    const cell = point.map((value) => Math.floor(value / tolerance));
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          const key = [cell[0] + x, cell[1] + y, cell[2] + z].join(",");
          for (const index of buckets.get(key) ?? []) {
            if (
              Math.hypot(...point.map((value, axis) => value - vertices[index][axis])) <= tolerance
            )
              return index;
          }
        }
    const index = vertices.length,
      key = cell.join(",");
    vertices.push(point);
    const bucket = buckets.get(key) ?? [];
    bucket.push(index);
    buckets.set(key, bucket);
    return index;
  };
  for (const face of body.faces) {
    if (!face.vertices.length || face.vertices.length % 9)
      throw new Error("A face has no complete triangle mesh");
    for (let i = 0; i < face.vertices.length; i += 9) {
      const triangle = [0, 3, 6].map((offset) =>
        vertex(face.vertices.slice(i + offset, i + offset + 3)),
      );
      // Kernel tessellation can repeat a vertex at a surface singularity. Welding
      // collapses these zero-area facets; only retain actual surface triangles.
      // The complete remainder must still pass closed/oriented validation below.
      if (new Set(triangle).size !== 3) continue;
      triangles.push(triangle);
    }
  }
  const mesh = { vertices, triangles };
  validateMesh(mesh);
  return mesh;
}

export function triangleNormal(points: number[][]): number[] {
  const [a, b, c] = points;
  const u = b.map((v, i) => v - a[i]),
    v = c.map((n, i) => n - a[i]);
  const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...cross);
  if (!Number.isFinite(length) || length === 0)
    throw new Error("Mesh contains a degenerate triangle");
  return cross.map((value) => value / length);
}

function validateMesh(mesh: ExportMesh): void {
  if (!mesh.triangles.length) throw new Error("There is no solid mesh to export");
  const edges = new Map<string, { count: number; direction: number }>();
  for (const triangle of mesh.triangles) {
    triangleNormal(triangle.map((index) => mesh.vertices[index]));
    for (let i = 0; i < 3; i++) {
      const a = triangle[i],
        b = triangle[(i + 1) % 3];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const edge = edges.get(key) ?? { count: 0, direction: 0 };
      edge.count++;
      edge.direction += a < b ? 1 : -1;
      edges.set(key, edge);
    }
  }
  if ([...edges.values()].some((edge) => edge.count !== 2 || edge.direction !== 0))
    throw new Error("The solid mesh is not closed and consistently oriented; export was stopped");
}
