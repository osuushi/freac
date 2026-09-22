import { arcAt, arcDomain } from "./arc-geometry.js";
import { closestOnCurve } from "./curve-geometry.js";
import { curveIntersections } from "./curve-intersections.js";
import { spanArea } from "./curve-spans.js";
import type { Arc, Curve, Segment } from "./document.js";
import { distance, midpoint } from "./geometry.js";

export type LoopEdge = Segment | Arc;
const epsilon = 1e-7;
export function reverseEdge(curve: LoopEdge): LoopEdge {
  return curve.kind === "arc"
    ? { ...curve, a: curve.b, b: curve.a, bulge: -curve.bulge }
    : { ...curve, a: curve.b, b: curve.a };
}
export function loopArea(curves: readonly LoopEdge[]): number {
  return curves.reduce((sum, curve) => {
    const domain = curve.kind === "arc" ? arcDomain(curve) : { start: 0, sweep: 1 };
    return sum + spanArea({ curve, start: domain.start, end: domain.start + domain.sweep });
  }, 0);
}
export function hasClosedEndpoints(curves: readonly Curve[]): boolean {
  return (
    curves.length > 1 &&
    curves.every(
      (c) =>
        c.kind !== "circle" &&
        [c.a, c.b].every((p) =>
          curves.some(
            (other) =>
              other.id !== c.id &&
              other.kind !== "circle" &&
              [other.a, other.b].some((q) => distance(p, q) < epsilon),
          ),
        ),
    )
  );
}
export function simpleBoundary(curves: readonly LoopEdge[]): void {
  for (let i = 0; i < curves.length; i++) {
    const a = curves[i];
    if (distance(a.b, curves[(i + 1) % curves.length].a) > epsilon)
      throw new Error("Select one closed loop");
    for (let j = i + 1; j < curves.length; j++) {
      const b = curves[j];
      const contacts = [
        ...curveIntersections(a, b),
        a.a,
        a.b,
        b.a,
        b.b,
        a.kind === "arc" ? arcAt(a, 0.5) : midpoint(a.a, a.b),
        b.kind === "arc" ? arcAt(b, 0.5) : midpoint(b.a, b.b),
      ];
      for (const point of contacts) {
        if (
          distance(point, closestOnCurve(a, point)) > epsilon ||
          distance(point, closestOnCurve(b, point)) > epsilon
        )
          continue;
        const adjacent = j === i + 1 || (i === 0 && j === curves.length - 1);
        const ends =
          [a.a, a.b].some((p) => distance(p, point) < epsilon) &&
          [b.a, b.b].some((p) => distance(p, point) < epsilon);
        if (!adjacent || !ends)
          throw new Error("Offset requires a simple loop without crossings or overlapping edges");
      }
    }
  }
}
export function orderedLoop(input: readonly Curve[]): LoopEdge[] {
  if (input.length < 2 || input.some((c) => c.kind === "circle" || c.kind === "bezier"))
    throw new Error("Select one closed line/arc loop");
  const remaining = input.filter((c): c is LoopEdge => c.kind === "segment" || c.kind === "arc");
  const first = remaining.shift();
  if (!first) throw new Error("Select one closed loop");
  const result = [first];
  while (remaining.length) {
    const end = result[result.length - 1].b;
    const next = remaining.filter(
      (c) => distance(c.a, end) < epsilon || distance(c.b, end) < epsilon,
    );
    if (next.length !== 1) throw new Error("Select one unambiguous closed loop");
    const curve = next[0];
    remaining.splice(remaining.indexOf(curve), 1);
    result.push(distance(curve.a, end) < epsilon ? curve : reverseEdge(curve));
  }
  simpleBoundary(result);
  const area = loopArea(result);
  if (Math.abs(area) < epsilon) throw new Error("Loop has no enclosed area");
  return area > 0 ? result : result.reverse().map(reverseEdge);
}
