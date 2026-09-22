import { arcCircle } from "./arc-geometry.js";
import type { Constraint, Curve, NumericConstraint, Sketch } from "./document.js";
import { distance } from "./geometry.js";

export function constraintCurves(constraint: Constraint): string[] {
  if (constraint.kind === "point-on-edge") return [constraint.point.curve, constraint.edge];
  if ("curve" in constraint) return [constraint.curve];
  if (constraint.kind === "horizontal" || constraint.kind === "vertical") return [constraint.a];
  return constraint.kind === "coincident"
    ? [constraint.a.curve, constraint.b.curve]
    : "b" in constraint
      ? [constraint.a, constraint.b]
      : [constraint.a];
}
export function numericValue(curve: Curve, kind: NumericConstraint["kind"]): number {
  if (kind === "length" && curve.kind === "segment") return distance(curve.a, curve.b);
  if (kind === "radius" && (curve.kind === "circle" || curve.kind === "arc"))
    return curve.kind === "circle" ? curve.radius : arcCircle(curve).radius;
  throw new Error("This dimension does not apply to the curve");
}
export function numericConstraints(sketch: Sketch): NumericConstraint[] {
  return sketch.constraints.filter((c): c is NumericConstraint => "curve" in c);
}
export function validateNumeric(sketch: Sketch, allowArcTargets = false): void {
  const seen = new Set<string>();
  for (const constraint of numericConstraints(sketch)) {
    const curve = sketch.curves.find((c) => c.id === constraint.curve),
      key = `${constraint.curve}/${constraint.kind}`;
    if (!curve || !Number.isFinite(constraint.value) || constraint.value <= 0)
      throw new Error("Invalid dimension lock");
    if (seen.has(key)) throw new Error("That dimension is already locked");
    seen.add(key);
    const linkedArcTarget =
      allowArcTargets &&
      curve.kind === "arc" &&
      geometricRelations(sketch).some((c) => constraintCurves(c).includes(curve.id));
    if (
      !linkedArcTarget &&
      Math.abs(numericValue(curve, constraint.kind) - constraint.value) > 1e-7
    )
      throw new Error(
        `${constraint.kind === "radius" ? "Radius" : "Length"} is locked at ${constraint.value} mm. Edit its number or unlock it.`,
      );
  }
}

export function geometricRelations(sketch: Sketch): Constraint[] {
  return sketch.constraints.filter(
    (c) =>
      (c.kind === "coincident" &&
        !sketch.groups.some(
          (g) => g.members.includes(c.a.curve) && g.members.includes(c.b.curve),
        )) ||
      c.kind === "point-on-edge" ||
      c.kind === "corner-angle" ||
      c.kind === "tangent" ||
      c.kind === "horizontal" ||
      c.kind === "vertical" ||
      c.kind === "equal" ||
      ((c.kind === "parallel" || c.kind === "perpendicular") &&
        !sketch.groups.some((g) => g.members.includes(c.a) && g.members.includes(c.b))),
  );
}
export function visibleConstraints(sketch: Sketch): Constraint[] {
  return [...numericConstraints(sketch), ...geometricRelations(sketch)];
}
