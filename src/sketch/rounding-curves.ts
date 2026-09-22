import { arcCircle, arcDomain, positiveAngle } from "./arc-geometry.js";
import type { Arc, Segment } from "./document.js";
import { distance, scale, subtract } from "./geometry.js";
import type { Point } from "./planes.js";
export type RoundingCurve = Segment | Arc;
export type CurveEnd = "a" | "b";
export const farEnd = (end: CurveEnd): CurveEnd => (end === "a" ? "b" : "a");
export function inwardTangent(curve: RoundingCurve, end: CurveEnd, point = curve[end]): Point {
  if (curve.kind === "segment") {
    const delta = subtract(curve[farEnd(end)], curve[end]);
    return scale(delta, 1 / Math.hypot(delta.x, delta.y));
  }
  const circle = arcCircle(curve),
    radial = subtract(point, circle.center);
  const sign = Math.sign(curve.bulge) * (end === "a" ? 1 : -1);
  return scale({ x: -radial.y, y: radial.x }, sign / circle.radius);
}
// Preserve the supporting circle and traversal when shortening a bounded arc.
export function trimRoundingCurve(
  curve: RoundingCurve,
  end: CurveEnd,
  point: Point,
): RoundingCurve | null {
  if (distance(point, curve[farEnd(end)]) < 1e-7) return null;
  if (curve.kind === "segment") return { ...curve, [end]: point };
  const center = arcCircle(curve).center;
  const a = end === "a" ? point : curve.a,
    b = end === "b" ? point : curve.b;
  const start = Math.atan2(a.y - center.y, a.x - center.x),
    finish = Math.atan2(b.y - center.y, b.x - center.x);
  const sign = Math.sign(arcDomain(curve).sweep);
  return { ...curve, a, b, bulge: Math.tan((sign * positiveAngle(sign * (finish - start))) / 4) };
}
