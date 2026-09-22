import * as THREE from "three";
import { bowGuides } from "./arc-edit.js";
import type { SketchEditor } from "./editor.js";
import { rotationOffset, rotationVisible, widgetRadius } from "./move-widget/geometry.js";
import type { Point } from "./planes.js";
import { hasTransformWidget, selectionFrame } from "./selection-frame.js";
export function transformHandles(editor: SketchEditor) {
  const frame = selectionFrame(editor),
    sketch = editor.sketch;
  if (!frame || !sketch || !hasTransformWidget(editor)) return null;
  const unit = editor.world.height / editor.world.canvas.clientHeight;
  const center = frame.pivot;
  const axes = (["x", "y"] as const).map((axis) => ({
    axis,
    point: {
      x: center.x + (axis === "x" ? widgetRadius * unit : 0),
      y: center.y + (axis === "y" ? widgetRadius * unit : 0),
    },
  }));
  // A bow handle owns its visible position. Move/M hides bow guides and exposes
  // every transform arrow when the two affordances would otherwise overlap.
  const guides = bowGuides(editor);
  return {
    center,
    axes: axes.filter(
      (axis) =>
        !guides.some(
          (guide) =>
            Math.hypot(axis.point.x - guide.point.x, axis.point.y - guide.point.y) < 20 * unit,
        ),
    ),
    rotationVisible: sketchRotationVisible(editor),
    rotation: { x: center.x + rotationOffset * unit, y: center.y + rotationOffset * unit },
  };
}
export function sketchRotationVisible(editor: SketchEditor): boolean {
  const plane = editor.sketch?.plane;
  return (
    !!plane &&
    rotationVisible(
      editor.world.camera,
      new THREE.Vector3(...plane.u).cross(new THREE.Vector3(...plane.v)).toArray() as [
        number,
        number,
        number,
      ],
    )
  );
}
export function axisQuantity(axis: "x" | "y") {
  return axis === "x" ? ("translateX" as const) : ("translateY" as const);
}
export function translatedPoint(point: Point, axis: "x" | "y", value: number): Point {
  return { ...point, [axis]: point[axis] + value };
}
