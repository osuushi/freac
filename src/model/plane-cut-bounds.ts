import type { PlaneFrame } from "../sketch/planes.js";

/** Broad phase only: an infinite plane must cross the interior of a target box.
 * Concavities, selected-face coverage and existing seams are checked on preview.
 */
export function planeCrossesBounds(frame: PlaneFrame, bounds: readonly number[]): boolean {
  const { u, v, origin } = frame;
  const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  let distance = 0;
  let radius = 0;
  for (let i = 0; i < 3; i++) {
    distance += normal[i] * ((bounds[i] + bounds[i + 3]) / 2 - origin[i]);
    radius += (Math.abs(normal[i]) * (bounds[i + 3] - bounds[i])) / 2;
  }
  return radius - Math.abs(distance) > 1e-6;
}
