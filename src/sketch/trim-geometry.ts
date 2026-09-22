import { arcCircle, arcDomain, positiveAngle } from "./arc-geometry.js";
import { bezierAt, bezierParameter, bezierSpan, splitBezier } from "./bezier-geometry.js";
import { circlePoint, closestOnCurve } from "./curve-geometry.js";
import { curveIntersections } from "./curve-intersections.js";
import type { Bezier, Curve } from "./document.js";
import { newId } from "./document.js";
import { add, distance, dot, scale, subtract } from "./geometry.js";
import type { Point } from "./planes.js";

export interface TrimSpan {
  curve: Curve;
  start: number;
  end: number;
}
const tolerance = 1e-7,
  turn = 2 * Math.PI;
export function trimParameter(curve: Curve, p: Point): number {
  if (curve.kind === "bezier") return bezierParameter(curve, p);
  if (curve.kind === "segment") {
    const v = subtract(curve.b, curve.a);
    return dot(subtract(p, curve.a), v) / dot(v, v);
  }
  const c = curve.kind === "arc" ? arcCircle(curve) : curve;
  const angle = Math.atan2(p.y - c.center.y, p.x - c.center.x);
  if (curve.kind === "circle") return positiveAngle(angle) / turn;
  if (distance(p, curve.a) < tolerance) return 0;
  if (distance(p, curve.b) < tolerance) return 1;
  const { start, sweep } = arcDomain(curve);
  return positiveAngle(Math.sign(sweep) * (angle - start)) / Math.abs(sweep);
}
export function trimPoint(curve: Curve, t: number): Point {
  if (curve.kind === "bezier") return bezierAt(curve, t);
  if (curve.kind === "segment") return add(curve.a, scale(subtract(curve.b, curve.a), t));
  const c = curve.kind === "arc" ? arcCircle(curve) : curve;
  const { start, sweep } = curve.kind === "arc" ? arcDomain(curve) : { start: 0, sweep: turn };
  return circlePoint(c, start + t * sweep);
}
function extent(curve: Curve): number {
  if (curve.kind === "bezier")
    return distance(curve.a, curve.c1) + distance(curve.c1, curve.c2) + distance(curve.c2, curve.b);
  return curve.kind === "segment"
    ? distance(curve.a, curve.b)
    : curve.kind === "circle"
      ? curve.radius * turn
      : arcCircle(curve).radius * Math.abs(arcDomain(curve).sweep);
}
export function trimSpans(curve: Curve, others: readonly Curve[]): TrimSpan[] {
  const cuts: number[] = curve.kind === "circle" ? [] : [0, 1];
  for (const other of others) {
    if (other.id === curve.id) continue;
    const points = [
      ...curveIntersections(curve, other),
      ...(other.kind === "circle" ? [] : [other.a, other.b]),
    ];
    for (const p of points)
      if (distance(p, closestOnCurve(curve, p)) <= tolerance) cuts.push(trimParameter(curve, p));
  }
  const epsilon = tolerance / extent(curve);
  const ordered = cuts
    .sort((a, b) => a - b)
    .filter((t, i, all) => i === 0 || t - all[i - 1] > epsilon);
  if (
    curve.kind === "circle" &&
    ordered.length > 1 &&
    ordered[0] + 1 - ordered[ordered.length - 1] < epsilon
  )
    ordered.pop();
  if (curve.kind === "circle" && ordered.length < 2) return [{ curve, start: 0, end: 1 }];
  const starts = curve.kind === "circle" ? ordered : ordered.slice(0, -1);
  return starts.map((start, i) => ({ curve, start, end: ordered[i + 1] ?? ordered[0] + 1 }));
}
export function trimAt(curve: Curve, others: readonly Curve[], p: Point): TrimSpan {
  const t = trimParameter(curve, closestOnCurve(curve, p));
  const spans = trimSpans(curve, others);
  return (
    spans.find((s) => {
      const v = curve.kind === "circle" && t < s.start ? t + 1 : t;
      return v >= s.start - 1e-10 && v <= s.end + 1e-10;
    }) ?? spans[0]
  );
}
export function spanCurve(span: TrimSpan, id = span.curve.id): Curve {
  const { curve, start, end } = span;
  if (curve.kind === "bezier") return { ...bezierSpan(curve, start, end), id };
  const a = trimPoint(curve, start),
    b = trimPoint(curve, end);
  if (curve.kind === "segment") return { ...curve, id, a, b };
  if (curve.kind === "circle" && end - start >= 1 - 1e-12) return { ...curve, id };
  const sweep = curve.kind === "arc" ? arcDomain(curve).sweep : turn;
  return {
    id,
    kind: "arc",
    construction: curve.construction,
    a,
    b,
    bulge: Math.tan((sweep * (end - start)) / 4),
  };
}
export function trimRemainders(span: TrimSpan): Curve[] {
  const { curve, start, end } = span;
  if (curve.kind === "circle")
    return end - start >= 1 - 1e-12 ? [] : [spanCurve({ curve, start: end, end: start + 1 })];
  const result: Curve[] = [];
  if (start * extent(curve) > tolerance) result.push(spanCurve({ curve, start: 0, end: start }));
  if ((1 - end) * extent(curve) > tolerance)
    result.push(spanCurve({ curve, start: end, end: 1 }, result.length ? newId() : curve.id));
  return result;
}

function bezierLength(curve: Bezier, epsilon: number, depth = 0): number {
  const chord = distance(curve.a, curve.b),
    polygon = extent(curve);
  if (polygon - chord <= epsilon || depth >= 24) return (polygon + chord) / 2;
  const [a, b] = splitBezier(curve, 0.5);
  return bezierLength(a, epsilon / 2, depth + 1) + bezierLength(b, epsilon / 2, depth + 1);
}

export function trimSpanLength(span: TrimSpan): number {
  const curve = spanCurve(span);
  return curve.kind === "bezier" ? bezierLength(curve, tolerance) : extent(curve);
}
