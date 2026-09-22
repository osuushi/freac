import type { Body } from "../model/body.js";
import { validateNumeric } from "./constraint-geometry.js";
import { measuredAngle, wrapDegrees } from "./corner-angle.js";
import { coplanar, type PlaneFrame, type Point, validateFrame } from "./planes.js";
import { validateIncidence } from "./point-incidence.js";
import { linkedPointCoordinate, validatePointLinks } from "./point-links.js";
import { validateTangency } from "./tangency.js";

export interface Segment {
  readonly id: string;
  readonly kind: "segment";
  readonly a: Point;
  readonly b: Point;
  readonly construction: boolean;
}
export interface Circle {
  readonly id: string;
  readonly kind: "circle";
  readonly center: Point;
  readonly radius: number;
  readonly construction: boolean;
}
export interface Arc {
  readonly id: string;
  readonly kind: "arc";
  readonly a: Point;
  readonly b: Point;
  readonly bulge: number;
  // At exactly 180 degrees either radius branch has identical geometry.
  readonly semicircleBranch?: "major";
  readonly construction: boolean;
}
export interface Bezier {
  readonly id: string;
  readonly kind: "bezier";
  readonly a: Point;
  readonly c1: Point;
  readonly c2: Point;
  readonly b: Point;
  readonly construction: boolean;
}
export type Curve = Segment | Circle | Arc | Bezier;
export interface Endpoint {
  readonly curve: string;
  readonly end: "a" | "b";
}
export type PointReference = Endpoint | { readonly curve: string; readonly end: "center" };
export interface NumericConstraint {
  readonly id: string;
  readonly kind: "length" | "radius";
  readonly curve: string;
  readonly value: number;
}
export interface AngleConstraint {
  readonly id: string;
  readonly kind: "corner-angle";
  readonly a: string;
  readonly b: string;
  readonly aEnd: "a" | "b";
  readonly bEnd: "a" | "b";
  readonly value: number;
}
export interface TangentConstraint {
  readonly id: string;
  readonly kind: "tangent";
  readonly a: string;
  readonly b: string;
  readonly side: -1 | 1 | "external" | "a-contains-b" | "b-contains-a";
  readonly junction?: { readonly aEnd: "a" | "b"; readonly bEnd: "a" | "b" };
}
export type Constraint =
  | {
      readonly id: string;
      readonly kind: "point-on-edge";
      readonly point: PointReference;
      readonly edge: string;
    }
  | TangentConstraint
  | AngleConstraint
  | NumericConstraint
  | { readonly id: string; readonly kind: "horizontal" | "vertical"; readonly a: string }
  | {
      readonly id: string;
      readonly kind: "coincident";
      readonly a: PointReference;
      readonly b: PointReference;
    }
  | {
      readonly id: string;
      readonly kind: "parallel" | "perpendicular" | "equal";
      readonly a: string;
      readonly b: string;
    };
export interface EditingGroup {
  readonly id: string;
  readonly kind: "rectangle";
  readonly members: readonly string[];
}
export interface Sketch {
  readonly id: string;
  readonly plane: PlaneFrame;
  readonly curves: readonly Curve[];
  readonly constraints: readonly Constraint[];
  readonly groups: readonly EditingGroup[];
}
export interface SketchDocument {
  readonly entityPresentation?: readonly import("../model/entity-presentation.js").EntityPresentation[];
  readonly units: "mm";
  readonly constructionPlanes?: readonly import("../model/construction-plane.js").ConstructionPlane[];
  readonly bodies?: readonly Body[];
  readonly sketches: readonly Sketch[];
}
export const newId = (): string => {
  // LAN HTTP does not expose randomUUID; getRandomValues remains available.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
export const emptySketch = (plane: PlaneFrame): Sketch => ({
  id: newId(),
  plane,
  curves: [],
  constraints: [],
  groups: [],
});
export const samePlane = coplanar;
export const sketchOn = (doc: SketchDocument, plane: PlaneFrame): Sketch | undefined =>
  doc.sketches.find((sketch) => samePlane(sketch.plane, plane));
export const withSketch = (doc: SketchDocument, sketch: Sketch): SketchDocument => ({
  ...doc,
  sketches: doc.sketches.some((item) => item.id === sketch.id)
    ? doc.sketches.map((item) => (item.id === sketch.id ? sketch : item))
    : [...doc.sketches, sketch],
});

// S1 degeneracy/residual checks for analytic segment edits, in millimetres.
// Curve intersection tolerances belong to the later curve adapter.
export function validateSketch(sketch: Sketch, solved = true): void {
  validateFrame(sketch.plane);
  const ids = new Set<string>(),
    definitions = new Set<string>();
  for (const constraint of sketch.constraints) {
    const { id, ...definition } = constraint;
    const key = JSON.stringify(Object.entries(definition).sort(([a], [b]) => a.localeCompare(b)));
    if (ids.has(id) || definitions.has(key)) throw new Error("Duplicate sketch constraint");
    ids.add(id);
    definitions.add(key);
  }
  const curves = new Map(sketch.curves.map((curve) => [curve.id, curve]));
  if (curves.size !== sketch.curves.length) throw new Error("Duplicate curve identity");
  for (const curve of sketch.curves) validateCurve(curve);
  validateNumeric(sketch, !solved);
  validatePointLinks(sketch);
  for (const constraint of sketch.constraints) {
    if (constraint.kind === "point-on-edge") {
      validateIncidence(sketch, constraint.point, constraint.edge, solved);
      continue;
    }
    if ("curve" in constraint) continue;
    if (constraint.kind === "tangent") {
      validateTangency(sketch, constraint, solved);
      continue;
    }
    if (constraint.kind === "corner-angle") {
      if (
        !Number.isFinite(constraint.value) ||
        Math.abs(constraint.value) > 180 ||
        (solved &&
          Math.abs(wrapDegrees(measuredAngle(sketch, constraint) - constraint.value)) > 1e-6)
      )
        throw new Error("Edges must satisfy their angle lock");
      continue;
    }
    if (constraint.kind === "horizontal" || constraint.kind === "vertical") {
      const edge = curves.get(constraint.a);
      if (edge?.kind !== "segment") throw new Error("Constraint requires a line segment");
      const axis = constraint.kind === "horizontal" ? "y" : "x";
      if (solved && Math.abs(edge.b[axis] - edge.a[axis]) > 1e-7)
        throw new Error("Line does not satisfy its axis constraint");
      continue;
    }
    if (constraint.kind === "coincident") {
      const a = linkedPointCoordinate(sketch, constraint.a);
      const b = linkedPointCoordinate(sketch, constraint.b);
      if (!a || !b || (solved && Math.hypot(a.x - b.x, a.y - b.y) > 1e-7))
        throw new Error("Connected endpoints must stay together");
    } else {
      const a = curves.get(constraint.a),
        b = curves.get("b" in constraint ? constraint.b : "");
      if (a?.kind !== "segment" || b?.kind !== "segment")
        throw new Error("Constraint requires line segments");
      const ax = a.b.x - a.a.x,
        ay = a.b.y - a.a.y,
        bx = b.b.x - b.a.x,
        by = b.b.y - b.a.y;
      if (constraint.kind === "equal") {
        if (solved && Math.abs(Math.hypot(ax, ay) - Math.hypot(bx, by)) > 1e-7)
          throw new Error("Line lengths must stay equal");
        continue;
      }
      const residual = constraint.kind === "parallel" ? ax * by - ay * bx : ax * bx + ay * by;
      if (solved && Math.abs(residual) / (Math.hypot(ax, ay) * Math.hypot(bx, by)) > 1e-7)
        throw new Error("Rectangle edges must remain perpendicular and parallel");
    }
  }
  for (const group of sketch.groups) {
    if (
      group.members.length !== 4 ||
      group.members.some((id) => curves.get(id)?.kind !== "segment")
    )
      throw new Error("Invalid rectangle group");
  }
}

function validateCurve(curve: Curve): void {
  if (!["segment", "circle", "arc", "bezier"].includes(curve.kind))
    throw new Error("Unknown sketch curve kind");
  if (curve.kind === "circle") {
    if (
      ![curve.center.x, curve.center.y, curve.radius].every(Number.isFinite) ||
      curve.radius < 1e-8
    )
      throw new Error("A circle needs a finite center and positive radius");
    return;
  }
  if (![curve.a.x, curve.a.y, curve.b.x, curve.b.y].every(Number.isFinite))
    throw new Error("Coordinates must be finite");
  if (
    curve.kind === "bezier" &&
    ![curve.c1.x, curve.c1.y, curve.c2.x, curve.c2.y].every(Number.isFinite)
  )
    throw new Error("Cubic handles must be finite");
  if (
    Math.hypot(curve.b.x - curve.a.x, curve.b.y - curve.a.y) < 1e-8 &&
    (curve.kind !== "bezier" ||
      Math.max(
        Math.hypot(curve.c1.x - curve.a.x, curve.c1.y - curve.a.y),
        Math.hypot(curve.c2.x - curve.a.x, curve.c2.y - curve.a.y),
      ) < 1e-8)
  )
    throw new Error("An edge needs a non-zero length");
  if (curve.kind === "arc" && (!Number.isFinite(curve.bulge) || Math.abs(curve.bulge) < 1e-12))
    throw new Error("An arc needs finite nonzero curvature");
}
