import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import { alignedAxis, uprightAxis } from "../sketch/move-widget/geometry.js";
import type { Vector } from "../sketch/planes.js";

/** The visible sketch plane, aligned view plane, or camera-level upright plane. */
export function transformPlane(editor: SketchEditor, origin: Vector): THREE.Plane {
  const world = editor.world;
  const frame = world.activeFrame;
  const aligned = alignedAxis(world.camera);
  const normal = frame
    ? new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v))
    : aligned !== null
      ? new THREE.Vector3().setComponent(aligned, 1)
      : new THREE.Vector3(...uprightAxis(world.camera));
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(...origin));
}

export function pointOnTransformPlane(
  editor: SketchEditor,
  x: number,
  y: number,
  plane: THREE.Plane,
): THREE.Vector3 | null {
  const bounds = editor.world.canvas.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(
    new THREE.Vector2(
      ((x - bounds.x) / bounds.width) * 2 - 1,
      1 - ((y - bounds.y) / bounds.height) * 2,
    ),
    editor.world.camera,
  );
  return ray.ray.intersectPlane(plane, new THREE.Vector3());
}
