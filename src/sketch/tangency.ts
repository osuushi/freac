import { arcCircle, onArc } from "./arc-geometry.js";
import { circularContact, makeCircularTangent } from "./circular-tangency.js";
import { makeCubicTangent, validateCubicTangency } from "./cubic-tangency.js";
import { closestOnCurve } from "./curve-geometry.js";
import { type Curve, newId, type Sketch, type TangentConstraint } from "./document.js";
import { add, distance, dot, scale, subtract, transform } from "./geometry.js";
import { makeJunctionTangent } from "./tangent-junction.js";

export function lineCircularPair(a: Curve, b: Curve) {
  const line = a.kind === "segment" ? a : b.kind === "segment" ? b : null;
  const curved =
    a.kind === "circle" || a.kind === "arc"
      ? a
      : b.kind === "circle" || b.kind === "arc"
        ? b
        : null;
  if (!line || !curved) throw new Error("Select a line and a circle or arc");
  return { line, curved, circle: curved.kind === "arc" ? arcCircle(curved) : curved };
}
export function tangentContact(a: Curve, b: Curve, side: number): void {
  const { line, curved, circle } = lineCircularPair(a, b);
  const u = scale(subtract(line.b, line.a), 1 / distance(line.a, line.b));
  const normal = { x: -u.y, y: u.x };
  const signed = dot(subtract(circle.center, line.a), normal);
  const contact = add(circle.center, scale(normal, -side * circle.radius));
  if (Math.abs(signed - side * circle.radius) > 1e-7)
    throw new Error("Curves must remain tangent on their chosen side");
  if (
    distance(closestOnCurve(line, contact), contact) > 1e-7 ||
    (curved.kind === "arc" && !onArc(curved, contact))
  )
    throw new Error("The tangent contact lies outside the selected edges");
}
export function validateTangency(sketch: Sketch, c: TangentConstraint, solved: boolean): void {
  const a = sketch.curves.find((curve) => curve.id === c.a);
  const b = sketch.curves.find((curve) => curve.id === c.b);
  if (!a || !b || a.id === b.id) throw new Error("Invalid tangent relationship");
  if (a.kind === "bezier" || b.kind === "bezier") {
    validateCubicTangency(sketch, c, solved);
    return;
  }
  if (
    c.junction &&
    (a.kind === "circle" ||
      b.kind === "circle" ||
      !["a", "b"].includes(c.junction.aEnd) ||
      !["a", "b"].includes(c.junction.bEnd))
  )
    throw new Error("Invalid tangent endpoint reference");
  if (typeof c.side === "string") {
    if (
      a.kind === "segment" ||
      b.kind === "segment" ||
      !["external", "a-contains-b", "b-contains-a"].includes(c.side)
    )
      throw new Error("Invalid circular tangent relationship");
    if (solved) circularContact(a, b, c.side);
    return;
  }
  if (c.side !== 1 && c.side !== -1) throw new Error("Invalid tangent side");
  if (c.junction && a.kind === "segment" && b.kind === "segment") {
    const da = subtract(a[c.junction.aEnd === "a" ? "b" : "a"], a[c.junction.aEnd]);
    const db = subtract(b[c.junction.bEnd === "a" ? "b" : "a"], b[c.junction.bEnd]);
    if (
      Math.abs(da.x * db.y - da.y * db.x) /
        (distance({ x: 0, y: 0 }, da) * distance({ x: 0, y: 0 }, db)) >
      1e-7
    )
      throw new Error("Curves must remain tangent at their junction");
    return;
  }
  lineCircularPair(a, b);
  if (solved) tangentContact(a, b, c.side);
}
export function makeTangent(sketch: Sketch, a: Curve, b: Curve): Sketch {
  if (
    sketch.constraints.some(
      (c) => c.kind === "tangent" && [c.a, c.b].includes(a.id) && [c.a, c.b].includes(b.id),
    )
  )
    throw new Error("That tangent relationship already exists");
  if (a.kind === "bezier" || b.kind === "bezier") return makeCubicTangent(sketch, a, b);
  const joined = makeJunctionTangent(sketch, a, b);
  if (joined) return joined;
  if (a.kind !== "segment" && b.kind !== "segment") return makeCircularTangent(sketch, a, b);
  const { line, circle } = lineCircularPair(a, b);
  const u = scale(subtract(line.b, line.a), 1 / distance(line.a, line.b));
  const normal = { x: -u.y, y: u.x };
  const signed = dot(subtract(circle.center, line.a), normal);
  const preferred = signed < 0 ? -1 : 1;
  for (const side of [preferred, -preferred] as const) {
    const shift = scale(normal, (signed - side * circle.radius) * (a.kind === "segment" ? 1 : -1));
    const changed = transform(sketch, new Set([a.id]), (p) => add(p, shift));
    const constraint: TangentConstraint = {
      id: newId(),
      kind: "tangent",
      a: a.id,
      b: b.id,
      side: side as -1 | 1,
    };
    const first = changed.curves.find((curve) => curve.id === a.id);
    if (!first) throw new Error("Missing tangent curve");
    const { line: candidateLine, curved, circle: candidateCircle } = lineCircularPair(first, b);
    const contact = add(candidateCircle.center, scale(normal, -side * candidateCircle.radius));
    if (
      distance(closestOnCurve(candidateLine, contact), contact) > 1e-7 ||
      (curved.kind === "arc" && !onArc(curved, contact))
    )
      continue;
    validateTangency(changed, constraint, true);
    return { ...changed, constraints: [...sketch.constraints, constraint] };
  }
  throw new Error("The tangent contact lies outside the selected edges");
}
