import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import { uprightAxis } from "../sketch/move-widget/geometry.js";
import type { Vector } from "../sketch/planes.js";

/** Unit-square projected area is proportional to the absolute view/normal dot product. */
export function movementNormal(camera: THREE.Camera): THREE.Vector3 {
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const areas = [0, 1, 2].map((axis) => ({
    axis,
    area: Math.abs(direction.getComponent(axis)),
  }));
  areas.sort((a, b) => b.area - a.area);
  return areas[0].area - areas[1].area <= areas[0].area * 0.05
    ? new THREE.Vector3(...uprightAxis(camera))
    : new THREE.Vector3().setComponent(areas[0].axis, 1);
}

/** The active sketch plane or most camera-facing principal plane. */
export function transformPlane(editor: SketchEditor, origin: Vector): THREE.Plane {
  const world = editor.world;
  const frame = world.activeFrame;
  const normal = frame
    ? new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v))
    : movementNormal(world.camera);
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
