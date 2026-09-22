import { arcCircle, onArc } from "./arc-geometry.js";
import { bezierIntersections } from "./bezier-intersections.js";
import type { Circle, Curve, Segment } from "./document.js";
import { add, distance, dot, scale, subtract } from "./geometry.js";
import type { Point } from "./planes.js";

const tolerance = 1e-7;
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
function lineCircle(line: Segment, circle: Circle, bounded = true): Point[] {
  const v = subtract(line.b, line.a),
    length2 = dot(v, v);
  if (!length2) return [];
  const t = dot(subtract(circle.center, line.a), v) / length2;
  const foot = add(line.a, scale(v, t));
  const height2 = circle.radius ** 2 - distance(foot, circle.center) ** 2;
  if (height2 < -tolerance * circle.radius) return [];
  const dt = Math.sqrt(Math.max(0, height2) / length2);
  const epsilon = tolerance / Math.sqrt(length2);
  return (dt === 0 ? [t] : [t - dt, t + dt])
    .filter((parameter) => !bounded || (parameter >= -epsilon && parameter <= 1 + epsilon))
    .map((parameter) =>
      add(line.a, scale(v, bounded ? Math.max(0, Math.min(1, parameter)) : parameter)),
    );
}
function circleCircle(a: Circle, b: Circle): Point[] {
  const d = distance(a.center, b.center);
  if (
    d < tolerance ||
    d > a.radius + b.radius + tolerance ||
    d < Math.abs(a.radius - b.radius) - tolerance
  )
    return [];
  const x = (a.radius ** 2 - b.radius ** 2 + d ** 2) / (2 * d);
  const height = Math.sqrt(Math.max(0, a.radius ** 2 - x ** 2));
  const direction = scale(subtract(b.center, a.center), 1 / d);
  const foot = add(a.center, scale(direction, x));
  const normal = { x: -direction.y, y: direction.x };
  return height < tolerance
    ? [foot]
    : [add(foot, scale(normal, height)), add(foot, scale(normal, -height))];
}
export function curveIntersections(a: Curve, b: Curve): Point[] {
  if (a.kind === "bezier") return bezierIntersections(a, b);
  if (b.kind === "bezier") return bezierIntersections(b, a);
  const first = a.kind === "arc" ? arcCircle(a) : a,
    second = b.kind === "arc" ? arcCircle(b) : b;
  return intersections(first, second).filter(
    (p) => (a.kind !== "arc" || onArc(a, p)) && (b.kind !== "arc" || onArc(b, p)),
  );
}
function intersections(a: Circle | Segment, b: Circle | Segment, bounded = true): Point[] {
  if (a.kind === "circle")
    return b.kind === "circle" ? circleCircle(a, b) : lineCircle(b, a, bounded);
  if (b.kind === "circle") return lineCircle(a, b, bounded);
  const v = subtract(a.b, a.a),
    w = subtract(b.b, b.a),
    offset = subtract(b.a, a.a);
  const denominator = cross(v, w);
  if (Math.abs(denominator) < 1e-12) return [];
  const t = cross(offset, w) / denominator,
    s = cross(offset, v) / denominator;
  return !bounded || (t >= 0 && t <= 1 && s >= 0 && s <= 1) ? [add(a.a, scale(v, t))] : [];
}

export function supportIntersections(a: Curve, b: Curve): Point[] {
  if (a.kind === "bezier" || b.kind === "bezier")
    throw new Error("Unbounded cubic support is not defined");
  return intersections(
    a.kind === "arc" ? arcCircle(a) : a,
    b.kind === "arc" ? arcCircle(b) : b,
    false,
  );
}
