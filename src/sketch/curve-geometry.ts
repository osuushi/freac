import { arcAt, arcCircle, onArc } from "./arc-geometry.js";
import { bezierAt, bezierBounds, bezierParameter, bezierSamples } from "./bezier-geometry.js";
import type { Circle, Curve } from "./document.js";
import { add, distance, dot, scale, subtract } from "./geometry.js";
import type { Point } from "./planes.js";

export function circlePoint(circle: Circle, angle: number): Point {
  return add(circle.center, {
    x: circle.radius * Math.cos(angle),
    y: circle.radius * Math.sin(angle),
  });
}
export function curveBounds(curve: Curve): Point[] {
  if (curve.kind === "bezier") return bezierBounds(curve);
  if (curve.kind === "segment") return [curve.a, curve.b];
  if (curve.kind === "arc")
    return [
      curve.a,
      curve.b,
      ...[0, 1, 2, 3]
        .map((i) => circlePoint(arcCircle(curve), (i * Math.PI) / 2))
        .filter((p) => onArc(curve, p)),
    ];
  return [
    { x: curve.center.x - curve.radius, y: curve.center.y - curve.radius },
    { x: curve.center.x + curve.radius, y: curve.center.y + curve.radius },
  ];
}
export function closestOnCurve(curve: Curve, point: Point): Point {
  if (curve.kind === "bezier") return bezierAt(curve, bezierParameter(curve, point));
  if (curve.kind === "arc") {
    const circle = arcCircle(curve),
      offset = subtract(point, circle.center);
    const projected = circlePoint(circle, Math.atan2(offset.y, offset.x));
    return onArc(curve, projected)
      ? projected
      : distance(point, curve.a) < distance(point, curve.b)
        ? curve.a
        : curve.b;
  }
  if (curve.kind === "circle") {
    const offset = subtract(point, curve.center);
    return circlePoint(curve, Math.atan2(offset.y, offset.x));
  }
  const v = subtract(curve.b, curve.a),
    denominator = dot(v, v);
  const t = denominator
    ? Math.max(0, Math.min(1, dot(subtract(point, curve.a), v) / denominator))
    : 0;
  return add(curve.a, scale(v, t));
}
// Display only: maximum chord sagitta is 0.3 pixels, bounded for extreme zoom.
// Analytic circles remain authoritative for selection, snapping and model edits.
export function displayPoints(curve: Curve, unitsPerPixel: number): Point[] {
  if (curve.kind === "bezier") return bezierSamples(curve, Math.max(1e-8, unitsPerPixel * 0.3));
  if (curve.kind === "segment") return [curve.a, curve.b];
  if (curve.kind === "arc") {
    const circle = arcCircle(curve);
    const step =
      2 * Math.acos(Math.max(-1, 1 - Math.min(circle.radius, unitsPerPixel * 0.3) / circle.radius));
    const count = Math.max(
      2,
      Math.min(2048, Math.ceil(Math.abs(4 * Math.atan(curve.bulge)) / step)),
    );
    return Array.from({ length: count + 1 }, (_, i) => arcAt(curve, i / count));
  }
  const angle =
    2 * Math.acos(Math.max(-1, 1 - Math.min(curve.radius, unitsPerPixel * 0.3) / curve.radius));
  const count = Math.max(32, Math.min(2048, Math.ceil((2 * Math.PI) / angle)));
  return Array.from({ length: count + 1 }, (_, i) =>
    circlePoint(curve, (2 * Math.PI * (i % count)) / count),
  );
}
export function curveFeatures(curve: Curve): { point: Point; label: string }[] {
  if (curve.kind === "bezier")
    return [
      { point: curve.a, label: "Endpoint" },
      { point: curve.b, label: "Endpoint" },
      { point: bezierAt(curve, 0.5), label: "Midpoint" },
    ];
  if (curve.kind === "arc")
    return [
      { point: curve.a, label: "Endpoint" },
      { point: curve.b, label: "Endpoint" },
      { point: arcAt(curve, 0.5), label: "Midpoint" },
      { point: arcCircle(curve).center, label: "Center" },
      ...[0, 1, 2, 3]
        .map((i) => circlePoint(arcCircle(curve), (i * Math.PI) / 2))
        .filter((p) => onArc(curve, p))
        .map((point) => ({ point, label: "Quadrant" })),
    ];
  if (curve.kind === "segment")
    return [
      { point: curve.a, label: "Endpoint" },
      { point: curve.b, label: "Endpoint" },
      { point: scale(add(curve.a, curve.b), 0.5), label: "Midpoint" },
    ];
  return [
    { point: curve.center, label: "Center" },
    ...[0, 1, 2, 3].map((i) => ({
      point: circlePoint(curve, (i * Math.PI) / 2),
      label: "Quadrant",
    })),
  ];
}
export function curveDistance(curve: Curve, point: Point): number {
  return distance(point, closestOnCurve(curve, point));
}
