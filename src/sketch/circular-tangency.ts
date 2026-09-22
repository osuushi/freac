import { arcCircle, onArc } from "./arc-geometry.js";
import { type Arc, type Circle, newId, type Sketch, type TangentConstraint } from "./document.js";
import { add, distance, scale, subtract, transform } from "./geometry.js";
import type { Point } from "./planes.js";

type Circular = Arc | Circle;
export type CircularSide = Exclude<TangentConstraint["side"], number>;
export const supportingCircle = (curve: Circular): Circle =>
  curve.kind === "arc" ? arcCircle(curve) : curve;
export function contactSeparation(a: Circle, b: Circle, side: CircularSide): number {
  const separation =
    side === "external"
      ? a.radius + b.radius
      : side === "a-contains-b"
        ? a.radius - b.radius
        : b.radius - a.radius;
  if (separation < 1e-8) throw new Error("Internal tangency must retain its containing circle");
  return separation;
}
function contactSigns(side: CircularSide): [number, number] {
  return side === "external" ? [1, -1] : side === "a-contains-b" ? [1, 1] : [-1, -1];
}
export function circularContact(a: Circular, b: Circular, side: CircularSide): void {
  const ca = supportingCircle(a),
    cb = supportingCircle(b);
  const d = distance(ca.center, cb.center);
  if (Math.abs(d - contactSeparation(ca, cb, side)) > 1e-7 || d < 1e-8)
    throw new Error("Curves must retain their tangent contact branch");
  const direction = scale(subtract(cb.center, ca.center), 1 / d);
  const contact = add(ca.center, scale(direction, contactSigns(side)[0] * ca.radius));
  if ((a.kind === "arc" && !onArc(a, contact)) || (b.kind === "arc" && !onArc(b, contact)))
    throw new Error("The tangent contact lies outside the selected arcs");
}
function directions(a: Circular, b: Circular, side: CircularSide): Point[] {
  const ca = supportingCircle(a),
    cb = supportingCircle(b);
  const d = distance(ca.center, cb.center);
  const result = [d > 1e-8 ? scale(subtract(cb.center, ca.center), 1 / d) : { x: 1, y: 0 }];
  const signs = contactSigns(side);
  for (const [i, curve] of [a, b].entries()) {
    if (curve.kind !== "arc") continue;
    const circle = supportingCircle(curve);
    for (const p of [curve.a, curve.b])
      result.push(scale(subtract(p, circle.center), signs[i] / circle.radius));
  }
  return result;
}
export function makeCircularTangent(sketch: Sketch, a: Circular, b: Circular): Sketch {
  const ca = supportingCircle(a),
    cb = supportingCircle(b);
  const sides: CircularSide[] = [
    "external",
    ca.radius > cb.radius ? "a-contains-b" : "b-contains-a",
  ];
  const candidates: { sketch: Sketch; movement: number }[] = [];
  for (const side of sides) {
    if (side !== "external" && Math.abs(ca.radius - cb.radius) < 1e-8) continue;
    const separation = contactSeparation(ca, cb, side);
    for (const direction of directions(a, b, side)) {
      const center = add(cb.center, scale(direction, -separation));
      const shift = subtract(center, ca.center);
      const changed = transform(sketch, new Set([a.id]), (p) => add(p, shift));
      const first = changed.curves.find((curve) => curve.id === a.id);
      if (!first || first.kind === "segment" || first.kind === "bezier") continue;
      try {
        circularContact(first, b, side);
      } catch {
        continue;
      }
      const c: TangentConstraint = { id: newId(), kind: "tangent", a: a.id, b: b.id, side };
      candidates.push({
        sketch: { ...changed, constraints: [...sketch.constraints, c] },
        movement: distance(center, ca.center),
      });
    }
  }
  candidates.sort((a, b) => a.movement - b.movement);
  if (!candidates.length) throw new Error("No tangent contact lies on both selected arcs");
  return candidates[0].sketch;
}
