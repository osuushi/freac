import { arcCircle } from "../sketch/arc-geometry.js";
import { contactSeparation, supportingCircle } from "../sketch/circular-tangency.js";
import { cubicTangentJunction } from "../sketch/cubic-tangency.js";
import type { Sketch, TangentConstraint } from "../sketch/document.js";
import { add, distance, dot, scale, subtract } from "../sketch/geometry.js";
import type { Point } from "../sketch/planes.js";
import { lineCircularPair, validateTangency } from "../sketch/tangency.js";
import { alignedJunctionCurves, tangentJunction } from "../sketch/tangent-junction.js";
import { curvePoints, type solverLayout } from "./solver-geometry.js";
import type { Equation } from "./solver-input.js";

export function tangentEquations(
  target: Sketch,
  layout: ReturnType<typeof solverLayout>,
  radii: Record<string, number>,
): Equation[] {
  return target.constraints
    .filter((c): c is TangentConstraint => c.kind === "tangent")
    .flatMap<Equation>((c) => {
      const a = target.curves.find((curve) => curve.id === c.a);
      const b = target.curves.find((curve) => curve.id === c.b);
      if (!a || !b) throw new Error("Missing tangent curve");
      if (cubicTangentJunction(target, c)) return [];
      const junction = tangentJunction(target, c);
      if (junction) {
        const vector = (curve: typeof junction.a, end: "a" | "b") =>
          curve.kind === "segment"
            ? [layout.index(curve.id), layout.index(curve.id) + 1]
            : [
                layout.pointIndex({ curve: curve.id, end: "center" }),
                layout.pointIndex({ curve: curve.id, end }),
              ];
        const [pa, pb] = vector(junction.a, junction.aEnd),
          [pc, pd] = vector(junction.b, junction.bEnd);
        return [
          {
            kind: "tangent-normal",
            a: pa,
            b: pb,
            c: pc,
            d: pd,
            parallel:
              (junction.a.kind === "arc" && junction.b.kind === "arc") ||
              (junction.a.kind === "segment" && junction.b.kind === "segment"),
          },
        ];
      }
      if (typeof c.side === "string")
        return [
          {
            kind: "tangent-circles",
            a: layout.pointIndex({ curve: a.id, end: "center" }),
            b: layout.pointIndex({ curve: b.id, end: "center" }),
            radius: radii[a.id],
            otherRadius: radii[b.id],
            internal: c.side !== "external",
          },
        ];
      const { line, curved } = lineCircularPair(a, b);
      return [
        {
          kind: "tangent-line",
          a: layout.index(line.id),
          b: layout.pointIndex({ curve: curved.id, end: "center" }),
          radius: radii[curved.id],
          side: c.side,
        },
      ];
    });
}

function seedCircularPeer(
  target: Sketch,
  previous: Sketch,
  c: TangentConstraint,
  points: Point[],
  index: (id: string) => number,
): void {
  if (typeof c.side !== "string") return;
  const a = target.curves.find((curve) => curve.id === c.a),
    b = target.curves.find((curve) => curve.id === c.b);
  const oldA = previous.curves.find((curve) => curve.id === c.a),
    oldB = previous.curves.find((curve) => curve.id === c.b);
  if (
    !a ||
    !b ||
    !oldA ||
    !oldB ||
    a.kind === "segment" ||
    b.kind === "segment" ||
    a.kind === "bezier" ||
    b.kind === "bezier"
  )
    return;
  const changedA = JSON.stringify(a) !== JSON.stringify(oldA),
    changedB = JSON.stringify(b) !== JSON.stringify(oldB);
  if (changedA === changedB) return;
  const ca = supportingCircle(a),
    cb = supportingCircle(b);
  const d = distance(ca.center, cb.center);
  if (d < 1e-8) return;
  const direction = scale(subtract(cb.center, ca.center), 1 / d);
  const desired = contactSeparation(ca, cb, c.side);
  const peer = changedA ? b : a;
  const shift = scale(direction, (desired - d) * (changedA ? 1 : -1));
  curvePoints(peer).forEach((p, offset) => {
    points[index(peer.id) + offset] = add(p, shift);
  });
}

// Seed a free tangent line by translation when its circular partner changes.
// This adds no equations or locks: the native solver still resolves all relations.
export function seedTangency(
  target: Sketch,
  previous: Sketch | undefined,
  points: Point[],
  index: (id: string) => number,
): void {
  for (const c of target.constraints) {
    if (c.kind !== "tangent" || !previous?.constraints.some((old) => old.id === c.id)) continue;
    if (cubicTangentJunction(target, c)) continue;
    if (tangentJunction(target, c)) {
      seedJunctionPeer(target, previous, c, points, index);
      continue;
    }
    const a = target.curves.find((curve) => curve.id === c.a);
    const b = target.curves.find((curve) => curve.id === c.b);
    if (!a || !b) continue;
    if (typeof c.side === "string") {
      seedCircularPeer(target, previous, c, points, index);
      continue;
    }
    const { line, curved, circle } = lineCircularPair(a, b);
    const oldLine = previous.curves.find((curve) => curve.id === line.id);
    const oldCurve = previous.curves.find((curve) => curve.id === curved.id);
    if (
      oldLine?.kind !== "segment" ||
      !oldCurve ||
      oldCurve.kind === "segment" ||
      oldCurve.kind === "bezier"
    )
      continue;
    if (distance(line.a, oldLine.a) > 1e-8 || distance(line.b, oldLine.b) > 1e-8) continue;
    const oldCircle = oldCurve.kind === "arc" ? arcCircle(oldCurve) : oldCurve;
    if (
      distance(circle.center, oldCircle.center) < 1e-8 &&
      Math.abs(circle.radius - oldCircle.radius) < 1e-8
    )
      continue;
    const u = scale(subtract(line.b, line.a), 1 / distance(line.a, line.b));
    const normal = { x: -u.y, y: u.x };
    const shift = scale(
      normal,
      dot(subtract(circle.center, line.a), normal) - c.side * circle.radius,
    );
    points[index(line.id)] = add(line.a, shift);
    points[index(line.id) + 1] = add(line.b, shift);
  }
}

function seedJunctionPeer(
  target: Sketch,
  previous: Sketch,
  c: TangentConstraint,
  points: Point[],
  index: (id: string) => number,
): void {
  const j = tangentJunction(target, c);
  if (!j) return;
  const changedA =
    JSON.stringify(j.a) !== JSON.stringify(previous.curves.find((curve) => curve.id === c.a));
  const changedB =
    JSON.stringify(j.b) !== JSON.stringify(previous.curves.find((curve) => curve.id === c.b));
  if (changedA === changedB) return;
  const peer = changedA ? j.b : j.a,
    source = changedA ? j.a : j.b;
  const options = alignedJunctionCurves(
    peer,
    source,
    changedA ? j.bEnd : j.aEnd,
    changedA ? j.aEnd : j.bEnd,
  );
  for (const candidate of options) {
    const seeded = {
      ...target,
      curves: target.curves.map((curve) => (curve.id === peer.id ? candidate : curve)),
    };
    try {
      validateTangency(seeded, c, true);
    } catch {
      continue;
    }
    curvePoints(candidate).forEach((p, offset) => {
      points[index(peer.id) + offset] = p;
    });
    return;
  }
}
