import type { Sketch } from "./document.js";
import { add, distance, subtract } from "./geometry.js";
import { movePoint, transformSelection } from "./line-edit.js";
import { type Hit, hitIds, pointHits, pointKey } from "./picking.js";
import type { Point } from "./planes.js";
import { resizeRectangle } from "./rectangle-edit.js";

// Co-location is a selection rule for this drag, not a persistent relationship.
export function dragPoints(
  sketch: Sketch,
  primary: Hit,
  hits: Hit[],
  target: Point,
  wholeMoveIds: ReadonlySet<string>,
  symmetric = false,
): Sketch {
  let result = sketch;
  if (primary.kind === "handle") {
    result = resizeRectangle(sketch, primary.group, primary.handle, target, symmetric);
    // An edge handle follows its normal; all coincident points follow that same location.
    target = pointHits(result).find((hit) => pointKey(hit) === pointKey(primary))?.point ?? target;
  }
  const delta = subtract(target, primary.point);
  const movingSelection =
    primary.kind === "center" || primary.kind === "midpoint" || primary.kind === "circleCenter";
  if (movingSelection) result = transformSelection(result, wholeMoveIds, (p) => add(p, delta));
  for (const hit of hits) {
    if (primary.kind === "handle" && pointKey(hit) === pointKey(primary)) continue;
    if (movingSelection && hitIds(hit).every((id) => wholeMoveIds.has(id))) continue;
    if (hit.kind === "endpoint") result = movePoint(result, hit.endpoint, target);
    if (hit.kind === "handle")
      result = resizeRectangle(result, hit.group, hit.handle, target, symmetric);
    if (hit.kind === "circleCenter")
      result = movePoint(result, { curve: hit.curve, end: "center" }, target);
    if (hit.kind === "center" || hit.kind === "midpoint")
      result = transformSelection(result, new Set(hitIds(hit)), (p) => add(p, delta));
  }
  const after = pointHits(result);
  for (const hit of hits) {
    const moved = after.find((point) => pointKey(point) === pointKey(hit));
    if (!moved || distance(moved.point, target) > 1e-7)
      throw new Error("These point handles cannot move together in that direction");
  }
  return result;
}
