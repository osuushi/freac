import { arcCircle } from "./arc-geometry.js";
import type { Bezier, Curve, Sketch, TangentConstraint } from "./document.js";
import { newId } from "./document.js";
import type { EditIntent } from "./edit-intent.js";
import { distance, scale, subtract } from "./geometry.js";
import type { Point } from "./planes.js";

type EndpointCurve = Exclude<Curve, { kind: "circle" }>;
type CubicJunction = {
  a: EndpointCurve;
  b: EndpointCurve;
  aEnd: "a" | "b";
  bEnd: "a" | "b";
};

export function cubicTangentJunction(sketch: Sketch, c: TangentConstraint): CubicJunction | null {
  if (!c.junction) return null;
  const a = sketch.curves.find((curve) => curve.id === c.a);
  const b = sketch.curves.find((curve) => curve.id === c.b);
  if (
    !a ||
    !b ||
    a.kind === "circle" ||
    b.kind === "circle" ||
    (a.kind !== "bezier" && b.kind !== "bezier") ||
    distance(a[c.junction.aEnd], b[c.junction.bEnd]) > 1e-7
  )
    return null;
  return { a, b, ...c.junction };
}

export function makeCubicTangent(sketch: Sketch, a: Curve, b: Curve): Sketch {
  const junction = findJunction(a, b);
  if (!junction) throw new Error("Cubic tangent curves must share an endpoint");
  const constraint: TangentConstraint = {
    id: newId(),
    kind: "tangent",
    a: a.id,
    b: b.id,
    side: 1,
    junction,
  };
  const preferred = a.kind === "bezier" ? a.id : b.id;
  const result = alignCubicTangent(
    { ...sketch, constraints: [...sketch.constraints, constraint] },
    constraint,
    preferred,
  );
  validateCubicTangency(result, constraint, true);
  return result;
}

export function resolveCubicTangencies(
  sketch: Sketch,
  previous: Sketch | undefined,
  intent: EditIntent,
): Sketch {
  let result = sketch;
  for (const constraint of sketch.constraints) {
    if (constraint.kind !== "tangent") continue;
    const junction = cubicTangentJunction(result, constraint);
    if (!junction) continue;
    result = alignCubicTangent(
      result,
      constraint,
      dependentCubic(junction, result, previous, constraint, intent),
    );
  }
  return result;
}

export function validateCubicTangency(sketch: Sketch, c: TangentConstraint, solved: boolean): void {
  const junction = cubicTangentJunction(sketch, c);
  if (!junction) throw new Error("Cubic tangent curves must share an endpoint");
  if (!solved) return;
  const a = direction(junction.a, junction.aEnd);
  const b = direction(junction.b, junction.bEnd);
  const magnitude = length(a) * length(b);
  if (magnitude < 1e-12) throw new Error("A cubic tangent handle cannot collapse");
  const residual = cross(a, b) / magnitude;
  if (Math.abs(residual) > 1e-7) throw new Error("Cubic tangent directions disagree");
}

function findJunction(a: Curve, b: Curve): TangentConstraint["junction"] | null {
  if (a.kind === "circle" || b.kind === "circle" || (a.kind !== "bezier" && b.kind !== "bezier"))
    return null;
  for (const aEnd of ["a", "b"] as const)
    for (const bEnd of ["a", "b"] as const)
      if (distance(a[aEnd], b[bEnd]) < 1e-7) return { aEnd, bEnd };
  return null;
}

function alignCubicTangent(sketch: Sketch, c: TangentConstraint, preferred?: string): Sketch {
  const junction = cubicTangentJunction(sketch, c);
  if (!junction) return sketch;
  const cubic = chooseCubic(junction, preferred);
  const first = cubic.curve.id === junction.a.id;
  const peer = first ? junction.b : junction.a;
  const own = direction(cubic.curve, cubic.end);
  const reference = direction(peer, first ? junction.bEnd : junction.aEnd);
  const magnitude = length(own);
  if (magnitude < 1e-8 || length(reference) < 1e-8)
    throw new Error("A cubic tangent handle cannot collapse");
  const aligned = scale(reference, -magnitude / length(reference));
  const handle = cubic.end === "a" ? "c1" : "c2";
  return {
    ...sketch,
    curves: sketch.curves.map((curve) => {
      if (curve.kind !== "bezier" || curve.id !== cubic.curve.id) return curve;
      return { ...curve, [handle]: addEndpoint(curve[cubic.end], aligned) };
    }),
  };
}

function chooseCubic(
  junction: CubicJunction,
  preferred?: string,
): { curve: Bezier; end: "a" | "b" } {
  const choices = [
    junction.a.kind === "bezier" ? { curve: junction.a, end: junction.aEnd } : null,
    junction.b.kind === "bezier" ? { curve: junction.b, end: junction.bEnd } : null,
  ].filter((choice): choice is { curve: Bezier; end: "a" | "b" } => !!choice);
  return choices.find((choice) => choice.curve.id === preferred) ?? choices[0];
}

function dependentCubic(
  junction: CubicJunction,
  sketch: Sketch,
  previous: Sketch | undefined,
  c: TangentConstraint,
  intent: EditIntent,
): string | undefined {
  const cubicIds = [junction.a, junction.b]
    .filter((curve): curve is Bezier => curve.kind === "bezier")
    .map((curve) => curve.id);
  const subject = intent.kind === "pair" ? intent.subject : undefined;
  if (subject && cubicIds.includes(subject)) return subject;
  if (!previous) return cubicIds[0];
  const changed = [c.a, c.b].filter((id) => {
    const curve = sketch.curves.find((item) => item.id === id);
    const old = previous.curves.find((item) => item.id === id);
    return curve?.kind === "bezier" && JSON.stringify(curve) !== JSON.stringify(old);
  });
  if (cubicIds.length === 2 && changed.length === 1)
    return cubicIds.find((id) => id !== changed[0]);
  return cubicIds[0];
}

function direction(curve: EndpointCurve, end: "a" | "b"): Point {
  if (curve.kind === "bezier") return subtract(curve[end === "a" ? "c1" : "c2"], curve[end]);
  if (curve.kind === "segment") return subtract(curve[end === "a" ? "b" : "a"], curve[end]);
  const radius = subtract(curve[end], arcCircle(curve).center);
  const tangent = { x: -radius.y * Math.sign(curve.bulge), y: radius.x * Math.sign(curve.bulge) };
  return end === "a" ? tangent : scale(tangent, -1);
}

const addEndpoint = (endpoint: Point, direction: Point): Point => ({
  x: endpoint.x + direction.x,
  y: endpoint.y + direction.y,
});
const length = (point: Point): number => Math.hypot(point.x, point.y);
const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;
