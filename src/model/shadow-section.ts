import type { Vector } from "../sketch/planes.js";
import type { ShadowGeometry } from "./movement-shadow-geometry.js";

/** Intersect presentation triangles with a fixed world plane, including tangent contact. */
export function shadowSection(geometry: ShadowGeometry, normal: number): ShadowGeometry | null {
  const triangles: Vector[][] = [],
    lines: Vector[][] = [];
  const epsilon = 1e-7;
  for (const triangle of geometry.triangles) {
    const points: Vector[] = [];
    const add = (point: Vector) => {
      point[normal] = 0;
      if (!points.some((p) => p.every((value, i) => Math.abs(value - point[i]) < epsilon)))
        points.push(point);
    };
    if (triangle.every((p) => Math.abs(p[normal]) <= epsilon)) {
      triangles.push(triangle);
      lines.push([...triangle, triangle[0]]);
      continue;
    }
    for (let i = 0; i < 3; i++) {
      const a = triangle[i],
        b = triangle[(i + 1) % 3];
      if (Math.abs(a[normal]) <= epsilon) add([...a]);
      if (
        (a[normal] < -epsilon && b[normal] > epsilon) ||
        (a[normal] > epsilon && b[normal] < -epsilon)
      ) {
        const t = a[normal] / (a[normal] - b[normal]);
        add(a.map((value, axis) => value + t * (b[axis] - value)) as Vector);
      }
    }
    if (points.length) lines.push(points.length === 1 ? [points[0], points[0]] : points);
  }
  return triangles.length || lines.length ? { triangles, lines } : null;
}
