import { type Projection, projectionCurves } from "../model/projection.js";
import { arcDomain } from "../sketch/arc-geometry.js";
import {
  type Curve,
  emptySketch,
  newId,
  type Sketch,
  type SketchDocument,
  validateSketch,
  withSketch,
} from "../sketch/document.js";
import { distance } from "../sketch/geometry.js";
import { type PlaneFrame, validateFrame } from "../sketch/planes.js";
import { boundary } from "./profile-boundary.js";

export function coplanar(a: PlaneFrame, b: PlaneFrame): boolean {
  const n = [
    a.u[1] * a.v[2] - a.u[2] * a.v[1],
    a.u[2] * a.v[0] - a.u[0] * a.v[2],
    a.u[0] * a.v[1] - a.u[1] * a.v[0],
  ];
  const dot = (v: number[]) => v.reduce((sum, x, i) => sum + x * n[i], 0);
  return (
    Math.abs(dot(b.u)) < 1e-8 &&
    Math.abs(dot(b.v)) < 1e-8 &&
    Math.abs(dot(b.origin.map((v, i) => v - a.origin[i]))) < 1e-7
  );
}
export function projectionTarget(document: SketchDocument, op: Projection): Sketch {
  validateFrame(op.frame);
  const existing = op.sketchId
    ? document.sketches.find((s) => s.id === op.sketchId)
    : document.sketches.find((s) => coplanar(s.plane, op.frame));
  if (existing && !coplanar(existing.plane, op.frame))
    throw new Error("Projection target plane does not match sketch");
  return existing ?? { ...emptySketch(op.frame), ...(op.sketchId ? { id: op.sketchId } : {}) };
}
export function projectionInput(document: SketchDocument, op: Projection, target: Sketch) {
  if (!op.sources.length) throw new Error("Select edges or sketch curves to project");
  const sources = projectionCurves(document, op.sources);
  if (!sources.length) throw new Error("Selected faces have no boundary to project");
  const curves = sources.flatMap((source) => {
    if (source.kind !== "curve") return [];
    const sketch = document.sketches.find((s) => s.id === source.sketch),
      curve = sketch?.curves.find((c) => c.id === source.curve);
    if (!sketch || !curve) throw new Error("Projection source no longer exists");
    const domain =
      curve.kind === "arc"
        ? arcDomain(curve)
        : { start: 0, sweep: curve.kind === "circle" ? 2 * Math.PI : 1 };
    return boundary(
      [{ curve, start: domain.start, end: domain.start + domain.sweep }],
      sketch.plane,
    );
  });
  const edges = sources.filter((s) => s.kind === "edge");
  const bodies = (document.bodies ?? []).filter((b) => edges.some((e) => e.body === b.id));
  return { kind: "project" as const, frame: target.plane, curves, edges, bodies };
}
function same(a: Curve, b: Curve): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "circle" || b.kind === "circle")
    return (
      a.kind === "circle" &&
      b.kind === "circle" &&
      distance(a.center, b.center) < 1e-7 &&
      Math.abs(a.radius - b.radius) < 1e-7
    );
  const forward = distance(a.a, b.a) < 1e-7 && distance(a.b, b.b) < 1e-7;
  const reverse = distance(a.a, b.b) < 1e-7 && distance(a.b, b.a) < 1e-7;
  if (!forward && !reverse) return false;
  if (a.kind === "arc" && b.kind === "arc")
    return Math.abs(a.bulge - (forward ? b.bulge : -b.bulge)) < 1e-9;
  if (a.kind === "bezier" && b.kind === "bezier")
    return (
      distance(a.c1, forward ? b.c1 : b.c2) < 1e-7 && distance(a.c2, forward ? b.c2 : b.c1) < 1e-7
    );
  return true;
}
export function projectedSketch(target: Sketch, projected: readonly Curve[]): Sketch {
  const curves = [...target.curves],
    added: Curve[] = [];
  for (const curve of projected) {
    if (curves.some((c) => same(c, curve))) continue;
    const copy = { ...curve, id: newId() };
    curves.push(copy);
    added.push(copy);
  }
  if (!added.length) throw new Error("Projection already exists in this sketch");
  const constraints = [...target.constraints];
  const points: { curve: string; end: "a" | "b"; point: { x: number; y: number } }[] = [];
  for (const curve of added)
    if (curve.kind !== "circle")
      for (const end of ["a", "b"] as const) {
        const peer = points.find((p) => distance(p.point, curve[end]) < 1e-7);
        const ref = { curve: curve.id, end };
        if (peer)
          constraints.push({
            id: newId(),
            kind: "coincident",
            a: ref,
            b: { curve: peer.curve, end: peer.end },
          });
        else points.push({ ...ref, point: curve[end] });
      }
  const result = { ...target, curves, constraints };
  validateSketch(result);
  return result;
}

export async function projectDocument(
  document: SketchDocument,
  projection: Projection,
  kernel: import("./solid-calculator.js").SolidCalculator,
): Promise<SketchDocument> {
  const target = projectionTarget(document, projection);
  const result = await kernel.calculate(projectionInput(document, projection, target));
  if (!result.curves) throw new Error("Kernel did not return projected curves");
  return withSketch(document, projectedSketch(target, result.curves));
}
