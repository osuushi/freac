import { curveDistance, curveFeatures } from "./curve-geometry.js";
import type { Constraint, Endpoint, PointReference, Sketch } from "./document.js";
import type { Drag } from "./drag-state.js";
import { distance } from "./geometry.js";
import type { Point } from "./planes.js";
import { linkedPointCoordinate } from "./point-links.js";

type Attachment = { kind: "coincident"; peer: Endpoint } | { kind: "point-on-edge"; edge: string };
export function drawingAttachment(sketch: Sketch, point: Point): Attachment | null {
  const hits = sketch.curves.filter(
    (curve) =>
      curveDistance(curve, point) < 1e-7 ||
      curveFeatures(curve).some((f) => distance(f.point, point) < 1e-7),
  );
  if (hits.length !== 1) return null;
  const curve = hits[0];
  if (curve.kind !== "circle") {
    for (const end of ["a", "b"] as const)
      if (distance(curve[end], point) < 1e-7)
        return { kind: "coincident", peer: { curve: curve.id, end } };
  }
  return curve.kind !== "bezier" && curveDistance(curve, point) < 1e-7
    ? { kind: "point-on-edge", edge: curve.id }
    : null;
}
export const attachmentSnap = (label?: string): boolean =>
  ["Endpoint", "Edge", "Midpoint", "Quadrant", "Fuse", "Coincident"].includes(label ?? "");

export function creationLinks(drag: Drag, candidate: Sketch, endSnapped: boolean): Sketch {
  if (!["createLine", "createBezier", "createRectangle", "createCircle"].includes(drag.mode))
    return candidate;
  const source = drag.base.sketches.find((sketch) => sketch.id === candidate.id);
  if (!source) return candidate;
  const start: PointReference | null = drag.line
    ? { curve: drag.line, end: "a" }
    : drag.circle
      ? { curve: drag.circle, end: "center" }
      : drag.group
        ? { curve: drag.group.members[0], end: "a" }
        : null;
  const end: PointReference | null = drag.line
    ? { curve: drag.line, end: "b" }
    : drag.group
      ? { curve: drag.group.members[2], end: "a" }
      : null;
  let result = candidate;
  for (const [i, ref] of [start, end].entries()) {
    if (
      !ref ||
      (i === 0 && drag.symmetric && ["createLine", "createRectangle"].includes(drag.mode)) ||
      !(i === 0 ? drag.startSnapped && !drag.startBypass : endSnapped && !drag.bypass)
    )
      continue;
    const attachment = drawingAttachment(source, linkedPointCoordinate(candidate, ref));
    if (!attachment) continue;
    const constraint: Constraint =
      attachment.kind === "coincident"
        ? { id: drag.linkIds[i], kind: "coincident", a: ref, b: attachment.peer }
        : { id: drag.linkIds[i], kind: "point-on-edge", point: ref, edge: attachment.edge };
    result = {
      ...result,
      constraints: [...result.constraints, constraint],
    };
  }
  return result;
}
