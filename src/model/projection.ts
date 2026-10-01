import type { SketchDocument } from "../sketch/document.js";
import type { PlaneFrame } from "../sketch/planes.js";
import { faceBoundaryEdges } from "./face-boundary.js";
import { featureEdges } from "./feature-edges.js";
export type ProjectionSource =
  | { kind: "body"; body: string }
  | { kind: "sketch"; sketch: string }
  | { kind: "profile"; sketch: string; profile: string }
  | { kind: "face"; body: string; face: string }
  | { kind: "edge"; body: string; edge: string }
  | { kind: "curve"; sketch: string; curve: string };
export interface Projection {
  sources: readonly ProjectionSource[];
  frame: PlaneFrame;
  sketchId?: string;
  direction?: "target-normal" | "source-normal";
}
export type ProjectionCurveSource = Extract<
  ProjectionSource,
  { kind: "curve" | "edge" | "profile" }
>;

/** Resolve the exterior wire boundary of a face set, retaining explicit edge selections. */
export function projectionCurves(document: SketchDocument, sources: readonly ProjectionSource[]) {
  const faces = sources.filter((s) => s.kind === "face");
  for (const face of faces)
    if (
      !document.bodies?.some((b) => b.id === face.body && b.faces.some((f) => f.id === face.face))
    )
      throw new Error("Projection source face no longer exists");
  const curves = [
    ...sources.flatMap((s): ProjectionCurveSource[] => {
      if (s.kind === "face") return [];
      if (s.kind === "body") {
        const body = document.bodies?.find((b) => b.id === s.body);
        if (!body) throw new Error("Projection source body no longer exists");
        return featureEdges(body).map((edge) => ({
          kind: "edge" as const,
          body: body.id,
          edge: edge.id,
        }));
      }
      if (s.kind === "sketch") {
        const sketch = document.sketches.find((sketch) => sketch.id === s.sketch);
        if (!sketch) throw new Error("Projection source sketch no longer exists");
        return sketch.curves
          .filter((c) => !c.construction)
          .map((c) => ({ kind: "curve" as const, sketch: sketch.id, curve: c.id }));
      }
      return [s];
    }),
    ...faceBoundaryEdges(document.bodies ?? [], faces),
  ];
  return curves.filter(
    (s, i) => curves.findIndex((p) => JSON.stringify(p) === JSON.stringify(s)) === i,
  );
}
