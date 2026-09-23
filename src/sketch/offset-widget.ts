import { directionalOffset, directionalWidget } from "../model/directional-widget.js";
import type { Sketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { offsetFrame } from "./offset-geometry.js";
import type { OffsetTarget } from "./offset-target.js";
import type { Vector } from "./planes.js";

export function placeOffsetWidget(
  editor: SketchEditor,
  sketch: Sketch,
  target: OffsetTarget,
  root: HTMLElement,
  handle: HTMLButtonElement,
): void {
  const base = offsetFrame(target.curve);
  const frame = {
      point: base.point,
      normal: { x: base.normal.x * target.direction, y: base.normal.y * target.direction },
    },
    p = editor.world.projectLocal(sketch.plane, frame.point);
  const normal = sketch.plane.u.map(
    (v, i) => v * frame.normal.x + sketch.plane.v[i] * frame.normal.y,
  ) as Vector;
  const width = sketch.plane.u.map(
    (v, i) => -v * frame.normal.y + sketch.plane.v[i] * frame.normal.x,
  ) as Vector;
  const offset = directionalOffset(editor.world.camera, normal, 48, width);
  handle.innerHTML = directionalWidget(editor.world.camera, normal, "offset", width);
  const bounds = editor.world.canvas.getBoundingClientRect();
  root.style.left = `${p.x - bounds.left + offset.x}px`;
  root.style.top = `${p.y - bounds.top + offset.y}px`;
}
