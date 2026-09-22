import type { Bezier } from "./document.js";
import { add, distance, scale, segmentDistance, subtract } from "./geometry.js";
import type { Point } from "./planes.js";
import { derivative, evaluate, multiply, roots, sum } from "./polynomial.js";

const lerp = (a: Point, b: Point, t: number) => add(scale(a, 1 - t), scale(b, t));
export function bezierPowers(c: Bezier, axis: "x" | "y"): number[] {
  const a = c.a[axis],
    p = c.c1[axis],
    q = c.c2[axis],
    b = c.b[axis];
  return [a, 3 * (p - a), 3 * (a - 2 * p + q), b - a + 3 * (p - q)];
}
export function bezierAt(c: Bezier, t: number): Point {
  return lerp(
    lerp(lerp(c.a, c.c1, t), lerp(c.c1, c.c2, t), t),
    lerp(lerp(c.c1, c.c2, t), lerp(c.c2, c.b, t), t),
    t,
  );
}
export function bezierDerivative(c: Bezier, t: number): Point {
  return {
    x: evaluate(derivative(bezierPowers(c, "x")), t),
    y: evaluate(derivative(bezierPowers(c, "y")), t),
  };
}
export function splitBezier(c: Bezier, t: number): [Bezier, Bezier] {
  const p = lerp(c.a, c.c1, t),
    q = lerp(c.c1, c.c2, t),
    r = lerp(c.c2, c.b, t);
  const s = lerp(p, q, t),
    u = lerp(q, r, t),
    m = lerp(s, u, t);
  return [
    { ...c, c1: p, c2: s, b: m },
    { ...c, a: m, c1: u, c2: r },
  ];
}
export function bezierSpan(c: Bezier, start: number, end: number): Bezier {
  if (start > end) {
    const reversed = bezierSpan(c, end, start);
    return { ...reversed, a: reversed.b, b: reversed.a, c1: reversed.c2, c2: reversed.c1 };
  }
  const left = end < 1 ? splitBezier(c, end)[0] : c;
  return start > 0 ? splitBezier(left, start / end)[1] : left;
}
export function bezierParameter(c: Bezier, p: Point): number {
  const x = bezierPowers(c, "x"),
    y = bezierPowers(c, "y");
  const dx = derivative(x),
    dy = derivative(y);
  x[0] -= p.x;
  y[0] -= p.y;
  return [0, 1, ...roots(sum(multiply(x, dx), multiply(y, dy)))].reduce(
    (best, t) => (distance(bezierAt(c, t), p) < distance(bezierAt(c, best), p) ? t : best),
    0,
  );
}
export function bezierBounds(c: Bezier): Point[] {
  return [
    0,
    1,
    ...roots(derivative(bezierPowers(c, "x"))),
    ...roots(derivative(bezierPowers(c, "y"))),
  ].map((t) => bezierAt(c, t));
}
export function bezierSamples(c: Bezier, tolerance: number): Point[] {
  const points: Point[] = [c.a];
  const visit = (part: Bezier, depth: number) => {
    const flat = Math.max(
      segmentDistance(part.c1, part.a, part.b),
      segmentDistance(part.c2, part.a, part.b),
    );
    if (flat <= tolerance || depth >= 20) {
      points.push(part.b);
      return;
    }
    const [a, b] = splitBezier(part, 0.5);
    visit(a, depth + 1);
    visit(b, depth + 1);
  };
  visit(c, 0);
  return points;
}
export function bezierArea(c: Bezier, start: number, end: number): number {
  const x = bezierPowers(c, "x"),
    y = bezierPowers(c, "y");
  const p = sum(
    multiply(x, derivative(y)),
    multiply(y, derivative(x)).map((v) => -v),
  );
  return p.reduce((a, v, i) => a + (v * (end ** (i + 1) - start ** (i + 1))) / (i + 1), 0) / 2;
}
export function bezierCurvature(c: Bezier, t: number): number {
  const d = bezierDerivative(c, t);
  const x = evaluate(derivative(derivative(bezierPowers(c, "x"))), t);
  const y = evaluate(derivative(derivative(bezierPowers(c, "y"))), t);
  return (d.x * y - d.y * x) / (Math.hypot(d.x, d.y) ** 3 || 1);
}
/** Endpoint motion carries its tangent handle, preserving the local derivative. */
export function moveBezierEnds(c: Bezier, a: Point, b: Point): Bezier {
  return { ...c, a, b, c1: add(c.c1, subtract(a, c.a)), c2: add(c.c2, subtract(b, c.b)) };
}

/** Distinct parameters at a cubic's ordinary self-crossing, independent of sampling. */
export function bezierSelfCrossing(c: Bezier): number[] {
  const x = bezierPowers(c, "x"),
    y = bezierPowers(c, "y");
  const denominator = x[3] * y[2] - y[3] * x[2];
  if (Math.abs(denominator) < 1e-14) return [];
  const u = -(x[3] * y[1] - y[3] * x[1]) / denominator;
  const axis = Math.abs(x[3]) > Math.abs(y[3]) ? x : y;
  const v = u * u + (axis[2] * u + axis[1]) / axis[3];
  const discriminant = u * u - 4 * v;
  if (discriminant <= 1e-14) return [];
  const a = (u - Math.sqrt(discriminant)) / 2,
    b = (u + Math.sqrt(discriminant)) / 2;
  return a >= 0 && b <= 1 ? [a, (a + b) / 2, b] : [];
}
