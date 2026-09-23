import { arcCircle, onArc } from "./arc-geometry.js";
import { curveBounds } from "./curve-geometry.js";
import type { Curve } from "./document.js";
import { type PlaneFrame, type Point, type Vector, worldPoint } from "./planes.js";

/** Extrema in world axes, including circles and rotated cubic curves. */
export function worldCurveBounds(curve: Curve, frame: PlaneFrame): Vector[] {
  if (curve.kind === "circle" || curve.kind === "arc") {
    const circle = curve.kind === "circle" ? curve : arcCircle(curve);
    const points: Point[] = curve.kind === "arc" ? [curve.a, curve.b] : [];
    for (let i = 0; i < 3; i++) {
      const angle = Math.atan2(frame.v[i], frame.u[i]);
      for (const t of [angle, angle + Math.PI]) {
        const p = {
          x: circle.center.x + circle.radius * Math.cos(t),
          y: circle.center.y + circle.radius * Math.sin(t),
        };
        if (curve.kind === "circle" || onArc(curve, p)) points.push(p);
      }
    }
    return points.map((p) => worldPoint(frame, p));
  }
  const result: Vector[] = [];
  // Each pair supplies exact component extrema. Only component bounds matter.
  for (const [a, b] of [
    [0, 1],
    [1, 2],
  ]) {
    const map = (p: Point): Point => {
      const w = worldPoint(frame, p);
      return { x: w[a], y: w[b] };
    };
    const mapped: Curve =
      curve.kind === "segment"
        ? { ...curve, a: map(curve.a), b: map(curve.b) }
        : { ...curve, a: map(curve.a), b: map(curve.b), c1: map(curve.c1), c2: map(curve.c2) };
    for (const p of curveBounds(mapped)) {
      const vector = worldPoint(frame, curve.a);
      vector[a] = p.x;
      vector[b] = p.y;
      result.push(vector);
    }
  }
  return result;
}
