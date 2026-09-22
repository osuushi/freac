import * as THREE from "three";
export type OrbitPointer = { x: number; y: number };
type OrbitView = { camera: THREE.OrthographicCamera; target: THREE.Vector3 };

/** Round the outer hemisphere into the equator without a jump in angular speed. */
export function spherePoint(point: OrbitPointer): THREE.Vector3 {
  const radius = Math.hypot(point.x, point.y);
  const taperStart = 0.8;
  if (radius <= taperStart)
    return new THREE.Vector3(point.x, point.y, Math.sqrt(1 - radius * radius));
  if (radius >= 1) return new THREE.Vector3(point.x, point.y, 0).normalize();
  const t = (radius - taperStart) / (1 - taperStart);
  const startAngle = Math.asin(taperStart);
  const startSlope = (1 - taperStart) / Math.sqrt(1 - taperStart * taperStart);
  // Cubic Hermite angle: match the sphere's slope, then reach the equator at zero slope.
  const angle =
    (2 * t ** 3 - 3 * t * t + 1) * startAngle +
    (t ** 3 - 2 * t * t + t) * startSlope +
    (-2 * t ** 3 + 3 * t * t) * (Math.PI / 2);
  const scale = Math.sin(angle) / radius;
  return new THREE.Vector3(point.x * scale, point.y * scale, Math.cos(angle));
}

/** Shoemake Arcball: total drag from the initial pose, never incremental fitting. */
export class Arcball {
  private start: {
    point: THREE.Vector3;
    orientation: THREE.Quaternion;
    offset: THREE.Vector3;
  } | null = null;
  get active(): boolean {
    return this.start !== null;
  }
  end(): void {
    this.start = null;
  }
  begin(view: OrbitView, from: OrbitPointer): void {
    view.camera.lookAt(view.target);
    view.camera.updateMatrixWorld();
    const point = spherePoint(from);
    this.start = {
      point,
      orientation: view.camera.quaternion.clone(),
      offset: view.camera.position.clone().sub(view.target),
    };
  }
  drag(view: OrbitView, to: OrbitPointer): void {
    if (!this.start) return;
    const { point, orientation, offset } = this.start;
    const destination = spherePoint(to);
    const cross = point.clone().cross(destination);
    // Half-angle arc convention: quaternion vector=cross, scalar=dot.
    const rotation = new THREE.Quaternion(
      cross.x,
      cross.y,
      cross.z,
      point.dot(destination),
    ).normalize();
    const worldRotation = orientation
      .clone()
      .multiply(rotation.invert())
      .multiply(orientation.clone().invert());
    view.camera.position.copy(offset).applyQuaternion(worldRotation).add(view.target);
    view.camera.up
      .set(0, 1, 0)
      .applyQuaternion(orientation)
      .applyQuaternion(worldRotation)
      .normalize();
  }
}

// With radians, a half-length projection costs as much as about 24 degrees of roll.
const foreshorteningWeight = 0.25;

/** Balance roll distance against foreshortening, then level the winning axis exactly. */
export function levelOrientation(view: OrbitView): THREE.Quaternion {
  view.camera.lookAt(view.target);
  view.camera.updateMatrixWorld();
  const orientation = view.camera.quaternion.clone();
  const inverse = orientation.clone().invert();
  let angle = 0;
  let bestScore = Infinity;
  for (const axis of [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ]) {
    const projected = axis.applyQuaternion(inverse);
    const length = Math.hypot(projected.x, projected.y);
    let candidate = Math.atan2(-projected.x, projected.y);
    if (candidate > Math.PI / 2) candidate -= Math.PI;
    if (candidate < -Math.PI / 2) candidate += Math.PI;
    // log(0) naturally gives infinite cost for an exactly end-on axis.
    const score = candidate * candidate - foreshorteningWeight * Math.log(length);
    if (score < bestScore) {
      bestScore = score;
      angle = candidate;
    }
  }
  return orientation.multiply(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle),
  );
}
