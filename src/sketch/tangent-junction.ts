import { arcCircle } from "./arc-geometry.js";
import { circularContact, supportingCircle } from "./circular-tangency.js";
import { type Curve, newId, type Sketch, type TangentConstraint } from "./document.js";
import { add, distance, dot, scale, subtract } from "./geometry.js";
import type { Point } from "./planes.js";
import { lineCircularPair, tangentContact } from "./tangency.js";

export function tangentJunction(sketch: Sketch, c: TangentConstraint) {
  const a = sketch.curves.find((curve) => curve.id === c.a);
  const b = sketch.curves.find((curve) => curve.id === c.b);
  if (
    !c.junction ||
    !a ||
    !b ||
    a.kind === "circle" ||
    b.kind === "circle" ||
    a.kind === "bezier" ||
    b.kind === "bezier"
  )
    return null;
  const pa = a[c.junction.aEnd],
    pb = b[c.junction.bEnd];
  return pa && pb && distance(pa, pb) < 1e-7 ? { a, b, point: pa, ...c.junction } : null;
}
function direction(curve: Exclude<Curve, { kind: "circle" | "bezier" }>, end: "a" | "b"): Point {
  if (curve.kind === "segment") return subtract(curve[end === "a" ? "b" : "a"], curve[end]);
  const r = subtract(curve[end], arcCircle(curve).center);
  return { x: -r.y, y: r.x };
}
export function makeJunctionTangent(sketch: Sketch, a: Curve, b: Curve): Sketch | null {
  if (a.kind === "circle" || b.kind === "circle" || a.kind === "bezier" || b.kind === "bezier")
    return null;
  for (const aEnd of ["a", "b"] as const)
    for (const bEnd of ["a", "b"] as const) {
      if (distance(a[aEnd], b[bEnd]) > 1e-7) continue;
      for (const first of alignedJunctionCurves(a, b, aEnd, bEnd)) {
        const changed = {
          ...sketch,
          curves: sketch.curves.map((curve) => (curve.id === a.id ? first : curve)),
        };
        let side: TangentConstraint["side"];
        if (first.kind === "arc" && b.kind === "arc") {
          const ca = supportingCircle(first),
            cb = supportingCircle(b);
          side =
            Math.abs(distance(ca.center, cb.center) - ca.radius - cb.radius) < 1e-7
              ? "external"
              : ca.radius > cb.radius
                ? "a-contains-b"
                : "b-contains-a";
          try {
            circularContact(first, b, side);
          } catch {
            continue;
          }
        } else if (first.kind === "segment" && b.kind === "segment") {
          side = 1;
        } else {
          const { line, circle } = lineCircularPair(first, b);
          const u = scale(subtract(line.b, line.a), 1 / distance(line.a, line.b));
          side = dot(subtract(circle.center, line.a), { x: -u.y, y: u.x }) < 0 ? -1 : 1;
          tangentContact(first, b, side);
        }
        return {
          ...changed,
          constraints: [
            ...sketch.constraints,
            { id: newId(), kind: "tangent", a: a.id, b: b.id, side, junction: { aEnd, bEnd } },
          ],
        };
      }
      throw new Error("No distinct tangent contact is possible at this junction");
    }
  return null;
}

export function alignedJunctionCurves(
  a: Exclude<Curve, { kind: "circle" | "bezier" }>,
  b: Exclude<Curve, { kind: "circle" | "bezier" }>,
  aEnd: "a" | "b",
  bEnd: "a" | "b",
): Exclude<Curve, { kind: "circle" | "bezier" }>[] {
  const point = a[aEnd],
    da = direction(a, aEnd),
    db = direction(b, bEnd);
  const angle = Math.atan2(db.y, db.x) - Math.atan2(da.y, da.x);
  const angles =
    a.kind === "segment" && b.kind === "segment"
      ? [angle + Math.PI, angle]
      : [angle, angle + Math.PI].sort((a, b) => Math.abs(a) - Math.abs(b));
  return angles
    .map((v) => Math.atan2(Math.sin(v), Math.cos(v)))
    .map((theta) => {
      const rotate = (p: Point) => {
        const v = subtract(p, point);
        return add(point, {
          x: v.x * Math.cos(theta) - v.y * Math.sin(theta),
          y: v.x * Math.sin(theta) + v.y * Math.cos(theta),
        });
      };
      return { ...a, a: rotate(a.a), b: rotate(a.b) };
    });
}
