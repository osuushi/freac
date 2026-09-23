import * as THREE from "three";
import type { CubeSurface } from "./orientation-cube-geometry.js";

/** Approach a face with the nearest quarter-turn; an already aligned face resets its roll. */
export function cubeAlignment(surface: CubeSurface, current: THREE.Quaternion): THREE.Quaternion {
  const canonical = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(surface.normal, new THREE.Vector3(), surface.up),
  );
  const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(current);
  if (surface.kind !== "face" || direction.dot(surface.normal) > 1 - 1e-8) return canonical;
  let best = canonical;
  let score = Math.abs(current.dot(best));
  for (let turn = 1; turn < 4; turn++) {
    const candidate = canonical
      .clone()
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (turn * Math.PI) / 2),
      );
    const candidateScore = Math.abs(current.dot(candidate));
    if (candidateScore > score + 1e-12) {
      best = candidate;
      score = candidateScore;
    }
  }
  return best;
}
