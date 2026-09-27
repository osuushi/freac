import * as THREE from "three";
import { curveBounds } from "./curve-geometry.js";
import type { SketchEditor } from "./editor.js";
import { type PlaneFrame, worldPoint } from "./planes.js";

/** Cache document-derived bounds; navigation only projects a single conservative box. */
export function installCameraDepth(editor: SketchEditor): void {
  let document: typeof editor.display | null = null;
  let visibility = "";
  let bounds = new THREE.Box3();
  editor.world.depthBounds = () => {
    const next = editor.display;
    const key = `${editor.bodiesVisible}:${editor.visibility.key}`;
    if (document === next && visibility === key) return bounds;
    document = next;
    visibility = key;
    bounds = new THREE.Box3().expandByPoint(new THREE.Vector3());
    for (const body of editor.bodiesVisible ? (next.bodies ?? []) : []) {
      if (!editor.visibility.visible(body.id)) continue;
      bounds.expandByPoint(new THREE.Vector3(...body.bounds.slice(0, 3)));
      bounds.expandByPoint(new THREE.Vector3(...body.bounds.slice(3, 6)));
    }
    const add = (frame: PlaneFrame, x: number, y: number) =>
      bounds.expandByPoint(new THREE.Vector3(...worldPoint(frame, { x, y })));
    for (const sketch of next.sketches) {
      if (!editor.visibility.visible(sketch.id)) continue;
      for (const curve of sketch.curves) {
        const points = curveBounds(curve);
        const xs = points.map((p) => p.x),
          ys = points.map((p) => p.y);
        // All four local box corners conservatively enclose curves on tilted planes.
        for (const x of [Math.min(...xs), Math.max(...xs)])
          for (const y of [Math.min(...ys), Math.max(...ys)]) add(sketch.plane, x, y);
      }
    }
    for (const plane of next.constructionPlanes ?? [])
      if (editor.visibility.visible(plane.id))
        bounds.expandByPoint(new THREE.Vector3(...plane.frame.origin));
    return bounds;
  };
}
