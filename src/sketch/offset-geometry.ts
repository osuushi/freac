import { arcAt, arcCircle } from "./arc-geometry.js";
import { bezierAt, bezierDerivative } from "./bezier-geometry.js";
import type { Curve } from "./document.js";
import { add, distance, midpoint, scale, subtract } from "./geometry.js";
import type { Point } from "./planes.js";

export function offsetFrame(curve: Curve): { point: Point; normal: Point } {
  if (curve.kind === "bezier") {
    const tangent = bezierDerivative(curve, 0.5),
      length = Math.hypot(tangent.x, tangent.y);
    if (length < 1e-10) throw new Error("Offset handle requires a regular curve tangent");
    return {
      point: bezierAt(curve, 0.5),
      normal: { x: -tangent.y / length, y: tangent.x / length },
    };
  }
  if (curve.kind === "segment") {
    const v = subtract(curve.b, curve.a),
      length = distance(curve.a, curve.b);
    return { point: midpoint(curve.a, curve.b), normal: { x: -v.y / length, y: v.x / length } };
  }
  const circle = curve.kind === "arc" ? arcCircle(curve) : curve;
  const point =
    curve.kind === "arc" ? arcAt(curve, 0.5) : add(circle.center, { x: circle.radius, y: 0 });
  return { point, normal: scale(subtract(point, circle.center), 1 / circle.radius) };
}

export function offsetCurve(curve: Curve, amount: number, id: string): Curve {
  if (curve.kind === "bezier") throw new Error("Cubic offsets are not available yet");
  if (!Number.isFinite(amount) || Math.abs(amount) < 1e-7)
    throw new Error("Enter a non-zero offset distance");
  if (curve.kind === "segment") {
    const delta = scale(offsetFrame(curve).normal, amount);
    return { ...curve, id, a: add(curve.a, delta), b: add(curve.b, delta) };
  }
  const circle = curve.kind === "arc" ? arcCircle(curve) : curve;
  const radius = circle.radius + amount;
  if (radius <= 1e-7) throw new Error("Offset would collapse the curve");
  if (curve.kind === "circle") return { ...curve, id, radius };
  const move = (p: Point) =>
    add(circle.center, scale(subtract(p, circle.center), radius / circle.radius));
  return { ...curve, id, a: move(curve.a), b: move(curve.b) };
}

export function offsetDistance(
  curve: Curve,
  start: Point,
  current: Point,
  spacing: number,
): number {
  const { normal } = offsetFrame(curve),
    delta = subtract(current, start);
  let amount = delta.x * normal.x + delta.y * normal.y;
  if (curve.kind === "circle" || curve.kind === "arc") {
    const center = curve.kind === "circle" ? curve.center : arcCircle(curve).center;
    amount = distance(current, center) - distance(start, center);
  }
  return spacing ? Math.round(amount / spacing) * spacing : amount;
}
