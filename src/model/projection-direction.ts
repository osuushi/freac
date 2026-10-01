import type { SketchDocument } from "../sketch/document.js";
import { parallelNormals, planeNormal, type Vector } from "../sketch/planes.js";
import type { ProjectionSource } from "./projection.js";

/** Current planar supports supply direction; bodies and spatial edges have no inferred ancestry. */
export function sourceProjectionNormal(
  document: SketchDocument,
  sources: readonly ProjectionSource[],
): Vector | null {
  let direction: Vector | null = null;
  for (const source of sources) {
    const frame =
      source.kind === "body" || source.kind === "edge"
        ? null
        : source.kind === "face"
          ? document.bodies
              ?.find((b) => b.id === source.body)
              ?.faces.find((f) => f.id === source.face)?.plane
          : document.sketches.find((s) => s.id === source.sketch)?.plane;
    if (!frame) return null;
    const n = planeNormal(frame);
    if (direction && !parallelNormals(n, direction)) return null;
    direction ??= n;
  }
  return direction;
}
