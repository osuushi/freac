import type { SketchDocument } from "../sketch/document.js";
import type { PlaneFrame } from "../sketch/planes.js";
import { faceBoundaryEdges } from "./face-boundary.js";
export type ProjectionSource =
  | { kind: "face"; body: string; face: string }
  | { kind: "edge"; body: string; edge: string }
  | { kind: "curve"; sketch: string; curve: string };
export interface Projection {
  sources: readonly ProjectionSource[];
  frame: PlaneFrame;
  sketchId?: string;
}

/** Resolve the exterior wire boundary of a face set, retaining explicit edge selections. */
export function projectionCurves(document: SketchDocument, sources: readonly ProjectionSource[]) {
  const faces = sources.filter((s) => s.kind === "face");
  for (const face of faces)
    if (
      !document.bodies?.some((b) => b.id === face.body && b.faces.some((f) => f.id === face.face))
    )
      throw new Error("Projection source face no longer exists");
  const curves = [
    ...sources.filter((s) => s.kind !== "face"),
    ...faceBoundaryEdges(document.bodies ?? [], faces),
  ];
  return curves.filter(
    (s, i) => curves.findIndex((p) => JSON.stringify(p) === JSON.stringify(s)) === i,
  );
}
