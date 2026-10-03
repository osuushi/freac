import * as THREE from "three";
import { selectionAnchor } from "../model/selection-anchor.js";
import { curveBounds } from "./curve-geometry.js";
import type { SketchEditor } from "./editor.js";
import { worldPoint } from "./planes.js";

/** Resolve before orbit exits the workspace and clears sketch selection. */
export function rollSelectionPivot(editor: SketchEditor): THREE.Vector3 | null {
  const sketch = editor.sketch;
  if (sketch) {
    const curves = editor.selectedCurves;
    const points = [
      ...sketch.curves.filter((curve) => curves.has(curve.id)).flatMap(curveBounds),
      ...editor.selected.pointHits(sketch).map((hit) => hit.point),
    ];
    if (points.length) {
      const bounds = new THREE.Box2();
      for (const point of points) bounds.expandByPoint(new THREE.Vector2(point.x, point.y));
      const center = bounds.getCenter(new THREE.Vector2());
      return new THREE.Vector3(...worldPoint(sketch.plane, center));
    }
  }
  return editor.modeling.targets.length ? new THREE.Vector3(...selectionAnchor(editor)) : null;
}
