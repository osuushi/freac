import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { scaleSelection } from "./scale-selection.js";
import { boxHandles, boxWorld, selectionBox } from "./transform-box.js";

/** Keep translation arrows reachable when a box handle lands on their usual radius. */
export function clearTransformArrow(editor: SketchEditor, pivot: Vector, tip: Vector): Vector {
  const source = scaleSelection(editor);
  const box = source && selectionBox(editor, source);
  if (!box) return tip;
  const origin = editor.world.project(pivot);
  const end = editor.world.project(tip);
  const length = Math.hypot(end.x - origin.x, end.y - origin.y);
  if (length < 1) return tip;
  const handles = boxHandles(box).map((h) => editor.world.project(boxWorld(box, h.point)));
  for (let offset = 0; offset <= handles.length * 48; offset += 48) {
    const ratio = (length + offset) / length;
    const x = origin.x + (end.x - origin.x) * ratio;
    const y = origin.y + (end.y - origin.y) * ratio;
    if (handles.every((p) => Math.abs(p.x - x) > 36 || Math.abs(p.y - y) > 36))
      return tip.map((v, i) => pivot[i] + (v - pivot[i]) * ratio) as Vector;
  }
  return tip;
}
