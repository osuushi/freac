import * as THREE from "three";
import type { Vector } from "../sketch/planes.js";

/** Roll only around the operation axis; its direction and anchor never billboard. */
export function cameraFacingWidth(camera: THREE.Camera, normal: Vector): Vector {
  const axis = new THREE.Vector3(...normal).normalize();
  const width = axis.clone().cross(camera.getWorldDirection(new THREE.Vector3()));
  if (width.lengthSq() < 1e-12) {
    // Exactly end-on has no preferred roll. Use camera right in the normal plane.
    width.set(1, 0, 0).applyQuaternion(camera.quaternion);
    width.addScaledVector(axis, -width.dot(axis));
  }
  return width.normalize().toArray() as Vector;
}
