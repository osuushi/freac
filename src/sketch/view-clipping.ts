import * as THREE from "three";
import type { PlaneFrame, Vector } from "./planes.js";

export function flipSectionFrame(frame: PlaneFrame): PlaneFrame {
  return { origin: [...frame.origin], u: [...frame.u], v: frame.v.map((n) => -n) as Vector };
}

/** Positive normal half-space remains visible, independently of camera orientation. */
export function sectionClip(frame: PlaneFrame): THREE.Plane {
  const normal = new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v)).normalize();
  return new THREE.Plane().setFromNormalAndCoplanarPoint(
    normal,
    new THREE.Vector3(...frame.origin),
  );
}
