import { arcCircle, positiveAngle } from "../sketch/arc-geometry.js";
import { constraintCurves, geometricRelations } from "../sketch/constraint-geometry.js";
import type { Arc, Curve, PointReference, Sketch } from "../sketch/document.js";
import { distance } from "../sketch/geometry.js";
import type { Point } from "../sketch/planes.js";

export function curvePoints(curve: Curve): Point[] {
  if (curve.kind === "circle") return [curve.center];
  return curve.kind === "arc" ? [curve.a, curve.b, arcCircle(curve).center] : [curve.a, curve.b];
}
export function solverLayout(sketch: Sketch) {
  const related = new Set(geometricRelations(sketch).flatMap(constraintCurves));
  const curves = [
    ...sketch.curves.filter((c) => c.kind === "segment" || c.kind === "bezier"),
    ...sketch.curves.filter((c) => c.kind === "circle"),
    ...sketch.curves.filter((c) => c.kind === "arc" && related.has(c.id)),
  ];
  const offsets = new Map<string, number>();
  const points: Point[] = [];
  for (const curve of curves) {
    offsets.set(curve.id, points.length);
    points.push(...curvePoints(curve));
  }
  const index = (id: string): number => {
    const offset = offsets.get(id);
    if (offset === undefined) throw new Error("Constraint refers to a missing curve");
    return offset;
  };
  const pointIndex = (p: PointReference): number =>
    index(p.curve) +
    (p.end === "b"
      ? 1
      : p.end === "center" && sketch.curves.some((c) => c.id === p.curve && c.kind === "arc")
        ? 2
        : 0);
  return { curves, points, index, pointIndex };
}
export function solvedArc(curve: Arc, a: Point, b: Point, center: Point): Arc {
  const old = arcCircle(curve);
  if (
    distance(a, curve.a) < 1e-10 &&
    distance(b, curve.b) < 1e-10 &&
    distance(center, old.center) < 1e-10
  )
    return curve;
  const sign = Math.sign(curve.bulge);
  const start = Math.atan2(a.y - center.y, a.x - center.x);
  const end = Math.atan2(b.y - center.y, b.x - center.x);
  const sweep = sign * positiveAngle(sign * (end - start));
  if (Math.abs(sweep) < 1e-8 || distance(a, b) < 1e-8)
    throw new Error("An arc needs distinct endpoints");
  return {
    ...curve,
    a,
    b,
    bulge: Math.tan(sweep / 4),
    semicircleBranch:
      Math.abs(curve.bulge) > 1 && Math.abs(Math.abs(sweep) - Math.PI) < 1e-8 ? "major" : undefined,
  };
}
