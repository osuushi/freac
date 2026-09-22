import * as THREE from "three";
import type { Vector } from "../sketch/planes.js";
import type { Face } from "./body.js";

type Frame = { center: Vector; normal: Vector };

/** View-only placement memory. The controller freezes its chosen frame during an edit. */
export class OffsetPlacement {
  private face: Face | null = null;
  private frame: Frame | null = null;
  private candidates: Frame[] = [];

  choose(face: Face, camera: THREE.Camera): Frame | null {
    if (!face.cylinder || face.blend) return null;
    if (face !== this.face) {
      this.face = face;
      this.frame = null;
      this.candidates = cylinderFrames(face);
    }
    const view = camera.getWorldDirection(new THREE.Vector3()).negate();
    // Stay on the visible side, but prefer a normal mostly across the screen.
    const score = (frame: Frame) => {
      const facing = new THREE.Vector3(...frame.normal).dot(view);
      // Continuous across the silhouette: near-axial views must not flip sides
      // merely because roundoff changes the sign of an almost-zero dot product.
      return 1 - Math.abs(facing - 0.35);
    };
    let best = this.frame;
    for (const candidate of this.candidates)
      if (!best || score(candidate) > score(best) + 1e-9) best = candidate;
    // A broad dead band preserves the same point through small or reversed orbits.
    if (best && (!this.frame || score(best) > score(this.frame) + 0.18)) this.frame = best;
    return this.frame;
  }
}

function cylinderFrames(face: Face): Frame[] {
  const cylinder = face.cylinder;
  if (!cylinder) return [];
  const axis = new THREE.Vector3(...cylinder.axis);
  const origin = new THREE.Vector3(...cylinder.origin);
  const frames: Frame[] = [];
  for (let i = 0; i < face.vertices.length; i += 9) {
    const point = new THREE.Vector3();
    for (let j = 0; j < 9; j += 3) point.add(new THREE.Vector3().fromArray(face.vertices, i + j));
    point.multiplyScalar(1 / 3);
    const along = origin.clone().addScaledVector(axis, point.clone().sub(origin).dot(axis));
    const radial = point.sub(along).normalize();
    frames.push({
      center: along.addScaledVector(radial, cylinder.radius).toArray() as Vector,
      normal: radial.multiplyScalar(cylinder.outward).toArray() as Vector,
    });
  }
  return frames;
}
