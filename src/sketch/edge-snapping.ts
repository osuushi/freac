import { closestOnCurve } from "./curve-geometry.js";
import { curveIntersections } from "./curve-intersections.js";
import type { Curve, Segment } from "./document.js";
import type { Point } from "./planes.js";
import { distance } from "./point-math.js";

// Only inspect grid lines inside the nearest grid corner's distance. A farther
// intersection cannot win; this bounds the work independently of curve length.
export function snapToEdge(
  curves: readonly Curve[],
  point: Point,
  tolerance: number,
  grid: Point | null,
  step: number,
): { point: Point; label: string } | null {
  const nearby = curves
    .map((curve) => ({ curve, point: closestOnCurve(curve, point) }))
    .filter((candidate) => distance(candidate.point, point) <= tolerance)
    .sort((a, b) => distance(a.point, point) - distance(b.point, point));
  if (!nearby.length) return null;
  if (!grid) return { point: nearby[0].point, label: "Edge" };
  let result = { point: grid, label: "Grid" };
  const radius = distance(grid, point);
  for (const axis of ["x", "y"] as const) {
    for (const offset of [-1, 0, 1]) {
      const coordinate = grid[axis] + offset * step;
      if (Math.abs(coordinate - point[axis]) > radius) continue;
      const line: Segment = {
        id: "grid-snap",
        kind: "segment",
        construction: true,
        a:
          axis === "x"
            ? { x: coordinate, y: point.y - radius - step }
            : { x: point.x - radius - step, y: coordinate },
        b:
          axis === "x"
            ? { x: coordinate, y: point.y + radius + step }
            : { x: point.x + radius + step, y: coordinate },
      };
      for (const { curve } of nearby)
        for (const intersection of curveIntersections(curve, line))
          if (distance(intersection, point) <= distance(result.point, point))
            result = { point: intersection, label: "Grid / edge" };
    }
  }
  return result;
}
