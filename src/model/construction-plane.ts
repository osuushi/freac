import type { SketchDocument } from "../sketch/document.js";
import { type PlaneFrame, type Vector, validateFrame } from "../sketch/planes.js";

export interface ConstructionPlane {
  readonly id: string;
  readonly frame: PlaneFrame;
}
export function withConstructionPlane(
  document: SketchDocument,
  plane: ConstructionPlane,
): SketchDocument {
  if (typeof plane.id !== "string" || !plane.id) throw new Error("A plane needs an identity");
  if (
    document.sketches.some((s) => s.id === plane.id) ||
    document.bodies?.some(
      (b) =>
        b.id === plane.id ||
        b.faces.some((f) => f.id === plane.id) ||
        b.edges.some((e) => e.id === plane.id),
    )
  )
    throw new Error("Duplicate document identity");
  validateFrame(plane.frame);
  const planes = document.constructionPlanes ?? [];
  return {
    ...document,
    constructionPlanes: planes.some((p) => p.id === plane.id)
      ? planes.map((p) => (p.id === plane.id ? plane : p))
      : [...planes, plane],
  };
}
export function offsetPlane(frame: PlaneFrame, distance: number): PlaneFrame {
  if (!Number.isFinite(distance)) throw new Error("Enter a finite plane offset");
  const [u, v] = [frame.u, frame.v];
  const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return {
    ...frame,
    origin: frame.origin.map((value, i) => value + normal[i] * distance) as Vector,
  };
}
