import { type Projection, projectionCurves } from "../model/projection.js";
import { arcDomain } from "../sketch/arc-geometry.js";
import { emptySketch, type Sketch, type SketchDocument, withSketch } from "../sketch/document.js";
import { type PlaneFrame, validateFrame } from "../sketch/planes.js";
import { projectedSketch } from "../sketch/projected-sketch.js";
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
