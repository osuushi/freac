import * as THREE from "three";
import { displayPoints } from "./curve-geometry.js";
import { boundaryPoints } from "./curve-spans.js";
import type { SketchEditor } from "./editor.js";
import { visibleOrbitCenter } from "./orbit-sampling.js";
import { type Vector, worldPoint } from "./planes.js";
import { selectedPointHits } from "./point-selection.js";

/** Selection is read before orbit exits the workspace and clears sketch targets. */
export function orbitPivot(editor: SketchEditor): THREE.Vector3 {
  const bounds = new THREE.Box3();
  const add = (point: Vector) => bounds.expandByPoint(new THREE.Vector3(...point));
  const vertices = (values: readonly number[]) => {
    for (let i = 0; i < values.length; i += 3) add([values[i], values[i + 1], values[i + 2]]);
  };
  const sketch = editor.sketch;
  if (editor.world.active && sketch) {
    const curves = editor.selectedCurves;
    for (const curve of sketch.curves)
      if (curves.has(curve.id))
        for (const p of displayPoints(curve, 0.001)) add(worldPoint(sketch.plane, p));
    for (const hit of selectedPointHits(editor)) add(worldPoint(sketch.plane, hit.point));
  } else {
    for (const target of editor.modeling.targets) {
      if (target.sketch !== undefined) {
        const item = editor.store.data.sketches.find((s) => s.id === target.sketch);
        if (!item) continue;
        const points =
          target.kind === "profile"
            ? boundaryPoints(target.profile.outer, 0.001)
            : item.curves.flatMap((curve) => displayPoints(curve, 0.001));
        for (const p of points) add(worldPoint(item.plane, p));
      } else {
        const body = editor.store.data.bodies?.find((b) => b.id === target.body);
        if (!body) continue;
        if (target.kind === "body") {
          add(body.bounds.slice(0, 3) as Vector);
          add(body.bounds.slice(3, 6) as Vector);
        } else if (target.kind === "face") {
          const face = body.faces.find((f) => f.id === target.face);
          if (face) vertices(face.vertices);
        } else {
          const edge = body.edges.find((e) => e.id === target.edge);
          if (edge) vertices(edge.points);
        }
      }
    }
  }
  if (!bounds.isEmpty()) return bounds.getCenter(new THREE.Vector3());
  const bodies = editor.bodiesVisible
    ? (editor.display.bodies ?? []).filter((b) => editor.visibility.visible(b.id))
    : [];
  const sketches = editor.display.sketches.filter((s) => editor.visibility.visible(s.id));
  return (
    visibleOrbitCenter(editor.world.camera, bodies, sketches, (p) =>
      editor.world.visiblePoint(p),
    ) ?? editor.world.target.clone()
  );
}
