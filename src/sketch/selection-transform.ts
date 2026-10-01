import type { Sketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { movePoint, transformSelection } from "./line-edit.js";
import type { Point } from "./planes.js";
import { resizeRectangle } from "./rectangle-edit.js";
import { hitIds } from "./sketch-hit.js";

// Points move as points. Their owner IDs in the render selection do not imply
// whole-edge movement. Calculate each target from the same gesture-start sketch.
export function transformSelected(
  editor: SketchEditor,
  sketch: Sketch,
  map: (point: Point) => Point,
): Sketch {
  const ids = new Set(editor.selectedCurves);
  const hits = editor.selected.pointHits(sketch);
  for (const hit of hits)
    if (hit.kind === "midpoint" || hit.kind === "center") for (const id of hitIds(hit)) ids.add(id);
  let result = transformSelection(sketch, ids, map);
  for (const hit of hits) {
    if (hitIds(hit).every((id) => ids.has(id))) continue;
    const target = map(hit.point);
    if (hit.kind === "endpoint") result = movePoint(result, hit.endpoint, target);
    if (hit.kind === "circleCenter")
      result = movePoint(result, { curve: hit.curve, end: "center" }, target);
    if (hit.kind === "handle") result = resizeRectangle(result, hit.group, hit.handle, target);
  }
  return result;
}
