import type { Body } from "../model/body.js";
import type { ProjectionCurveSource, ProjectionSource } from "../model/projection.js";
import { type Projection, projectionCurves } from "../model/projection.js";
import { sourceProjectionNormal } from "../model/projection-direction.js";
import { arcDomain } from "../sketch/arc-geometry.js";
import { emptySketch, type Sketch, type SketchDocument, withSketch } from "../sketch/document.js";
import type { Vector } from "../sketch/planes.js";
import { type PlaneFrame, planeNormal, validateFrame } from "../sketch/planes.js";
import { profilesFor } from "../sketch/profiles.js";
import { projectedSketch } from "../sketch/projected-sketch.js";
import { boundary } from "./profile-boundary.js";

interface ProjectionKernelInput {
  kind: "project";
  frame: PlaneFrame;
  direction?: Vector;
  curves: ReturnType<typeof boundary>;
  edges: (Extract<ProjectionCurveSource, { kind: "edge" }> & { implicit?: boolean })[];
  contours?: Extract<ProjectionSource, { kind: "body" | "face" }>[];
  bodies: Body[];
}

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
export function projectionInput(
  document: SketchDocument,
  op: Projection,
  target: Sketch,
): ProjectionKernelInput {
  if (!op.sources.length) throw new Error("Select geometry to project");
  if (op.direction && !["target-normal", "source-normal"].includes(op.direction))
    throw new Error("Unknown projection direction");
  const direction =
    op.direction === "source-normal"
      ? sourceProjectionNormal(document, op.sources)
      : planeNormal(target.plane);
  if (!direction)
    throw new Error("Source-normal projection requires planar sources sharing a normal");
  if (Math.abs(planeNormal(target.plane).reduce((sum, v, i) => sum + v * direction[i], 0)) < 1e-8)
    throw new Error("Source normal is parallel to the target plane; rays cannot reach it");
  const sources = projectionCurves(document, op.sources);
  const contours = op.sources.filter((s) => s.kind === "body" || s.kind === "face");
  if (!sources.length && !contours.length) throw new Error("Selection has no geometry to project");
  const curves = sources.flatMap((source) => {
    if (source.kind === "edge") return [];
    const sketch = document.sketches.find((s) => s.id === source.sketch);
    if (!sketch) throw new Error("Projection source no longer exists");
    if (source.kind === "profile") {
      const profile = profilesFor(sketch).find((p) => p.key === source.profile);
      if (!profile) throw new Error("Projection source region no longer exists");
      return [profile.outer, ...profile.holes].flatMap((loop) => boundary(loop, sketch.plane));
    }
    const curve = sketch?.curves.find((c) => c.id === source.curve);
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
  const edges = sources
    .filter((s) => s.kind === "edge")
    .map((edge) => ({
      ...edge,
      implicit: !op.sources.some(
        (s) => s.kind === "edge" && s.body === edge.body && s.edge === edge.edge,
      ),
    }));
  const bodies = (document.bodies ?? []).filter((b) =>
    [...edges, ...contours].some((e) => e.body === b.id),
  );
  return {
    kind: "project" as const,
    frame: target.plane,
    direction,
    curves,
    edges,
    contours,
    bodies,
  };
}

export async function projectDocument(
  document: SketchDocument,
  projection: Projection,
  kernel: import("./solid-calculator.js").SolidCalculator,
): Promise<SketchDocument> {
  const target = projectionTarget(document, projection);
  const result = await kernel.calculate(projectionInput(document, projection, target));
  return withSketch(document, projectedSketch(target, result.curves));
}
