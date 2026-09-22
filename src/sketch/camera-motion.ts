import * as THREE from "three";
import type { PlaneFrame, Point, Vector } from "./planes.js";
import type { World } from "./world.js";

type View = Pick<World, "camera" | "target" | "height">;
export type CameraFraming = { target?: Vector; height?: number };
export type CameraPose = {
  target: THREE.Vector3;
  quaternion: THREE.Quaternion;
  distance: number;
  height: number;
};

/**
 * Put the camera on a sketch plane while making the smallest possible turn
 * that still presents the plane's two axes as the screen axes.
 *
 * A plane has four valid axis-aligned views: either side of the normal and
 * either in-plane up direction. Comparing their quaternions avoids an
 * arbitrary half-turn when entering a plane from an oblique 3D view.
 */
export function planeCameraPose(
  view: View,
  frame: PlaneFrame,
  framing: CameraFraming = {},
  distance = 120,
): CameraPose {
  const normal = new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v)).normalize();
  view.camera.lookAt(view.target);
  view.camera.updateMatrixWorld();
  const previous = view.camera.quaternion.clone();
  const target = framing.target
    ? new THREE.Vector3(...framing.target)
    : view.target
        .clone()
        .addScaledVector(normal, new THREE.Vector3(...frame.origin).sub(view.target).dot(normal));
  const up = new THREE.Vector3(...frame.v);
  let best:
    | { side: number; upSign: number; quaternion: THREE.Quaternion; score: number }
    | undefined;
  for (const side of [-1, 1]) {
    for (const upSign of [-1, 1]) {
      const candidate = new THREE.OrthographicCamera();
      candidate.position.copy(target).addScaledVector(normal, side * distance);
      candidate.up.copy(up).multiplyScalar(upSign);
      candidate.lookAt(target);
      candidate.updateMatrixWorld();
      const score = Math.abs(previous.dot(candidate.quaternion));
      if (!best || score > best.score)
        best = { side, upSign, quaternion: candidate.quaternion.clone(), score };
    }
  }
  if (!best) throw new Error("A plane camera pose requires an orientation");
  return {
    target,
    quaternion: best.quaternion,
    distance,
    height: framing.height ?? view.height,
  };
}

export function applyCameraPose(view: View, pose: CameraPose): void {
  view.target.copy(pose.target);
  view.height = pose.height;
  view.camera.quaternion.copy(pose.quaternion);
  view.camera.up.set(0, 1, 0).applyQuaternion(pose.quaternion).normalize();
  view.camera.position
    .copy(pose.target)
    .add(new THREE.Vector3(0, 0, pose.distance).applyQuaternion(pose.quaternion));
  view.camera.updateMatrixWorld();
}

export function alignCameraToPlane(
  view: View,
  frame: PlaneFrame,
  distance = 120,
  framing: CameraFraming = {},
): void {
  applyCameraPose(view, planeCameraPose(view, frame, framing, distance));
}

export function panCamera(view: View, dx: number, dy: number, viewportHeight: number): void {
  const right = new THREE.Vector3().setFromMatrixColumn(view.camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(view.camera.matrixWorld, 1);
  const scale = view.height / Math.max(1, viewportHeight);
  const delta = right.multiplyScalar(-dx * scale).addScaledVector(up, dy * scale);
  view.target.add(delta);
  view.camera.position.add(delta);
}

export function zoomCamera(
  view: View,
  factor: number,
  pointerOffset: Point,
  viewportHeight: number,
): void {
  const previous = view.height;
  view.height = THREE.MathUtils.clamp(previous * factor, 0.5, 10000);
  // Preserve the world point underneath the pinch center in this orthographic view.
  const amount = (previous - view.height) / Math.max(1, viewportHeight);
  const right = new THREE.Vector3().setFromMatrixColumn(view.camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(view.camera.matrixWorld, 1);
  const delta = right
    .multiplyScalar(pointerOffset.x * amount)
    .addScaledVector(up, -pointerOffset.y * amount);
  view.target.add(delta);
  view.camera.position.add(delta);
}
