import * as THREE from "three";
export type OrbitPointer = { x: number; y: number };
type OrbitView = { camera: THREE.OrthographicCamera; target: THREE.Vector3 };

// A broad annulus gives a gradual change from level turntable motion to pure roll.
const turntableInnerRadius = 0.55;
const rollOuterRadius = 1;
const rotationPerRadius = 2;

function turntableWeight(point: OrbitPointer): number {
  const radius = Math.hypot(point.x, point.y);
  const t = THREE.MathUtils.clamp(
    (radius - turntableInnerRadius) / (rollOuterRadius - turntableInnerRadius),
    0,
    1,
  );
  return 1 - t * t * (3 - 2 * t);
}

/** Press-based turntable with a smooth outer barrel-roll ring. */
export class SmoothedTurntable {
  private start: {
    point: OrbitPointer;
    orientation: THREE.Quaternion;
    offset: THREE.Vector3;
    targetOffset: THREE.Vector3;
    pivot: THREE.Vector3;
    upAxis: THREE.Vector3;
    turntable: number;
    last: OrbitPointer;
    rollAngle: number;
  } | null = null;
  get active(): boolean {
    return this.start !== null;
  }
  end(): void {
    this.start = null;
  }
  begin(view: OrbitView, from: OrbitPointer, pivot = view.target): void {
    view.camera.lookAt(view.target);
    view.camera.updateMatrixWorld();
    const orientation = view.camera.quaternion.clone();
    this.start = {
      point: { ...from },
      orientation,
      offset: view.camera.position.clone().sub(pivot),
      targetOffset: view.target.clone().sub(pivot),
      pivot: pivot.clone(),
      upAxis: levelAxis(orientation).axis,
      turntable: turntableWeight(from),
      last: { ...from },
      rollAngle: 0,
    };
  }
  drag(view: OrbitView, to: OrbitPointer): void {
    if (!this.start) return;
    const { point, orientation, offset, targetOffset, pivot, upAxis, turntable } = this.start;
    const { last } = this.start;
    this.start.rollAngle += Math.atan2(
      last.x * to.y - last.y * to.x,
      last.x * to.x + last.y * to.y,
    );
    this.start.last = { ...to };
    const yaw = -rotationPerRadius * (to.x - point.x) * turntable;
    const pitch = rotationPerRadius * (to.y - point.y) * turntable;
    const roll = -2 * this.start.rollAngle * (1 - turntable);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(orientation);
    const viewAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(orientation);
    const rotation = new THREE.Quaternion()
      .setFromAxisAngle(upAxis, yaw)
      .multiply(new THREE.Quaternion().setFromAxisAngle(right, pitch))
      .multiply(new THREE.Quaternion().setFromAxisAngle(viewAxis, roll));
    view.target.copy(targetOffset).applyQuaternion(rotation).add(pivot);
    view.camera.position.copy(offset).applyQuaternion(rotation).add(pivot);
    view.camera.up.set(0, 1, 0).applyQuaternion(orientation).applyQuaternion(rotation).normalize();
  }
}

// With radians, a half-length projection costs as much as about 24 degrees of roll.
const foreshorteningWeight = 0.25;

function levelAxis(orientation: THREE.Quaternion): { axis: THREE.Vector3; angle: number } {
  const inverse = orientation.clone().invert();
  let angle = 0;
  let axis = new THREE.Vector3(0, 0, 1);
  let bestScore = Infinity;
  for (const candidateAxis of [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ]) {
    const projected = candidateAxis.clone().applyQuaternion(inverse);
    const length = Math.hypot(projected.x, projected.y);
    let candidate = Math.atan2(-projected.x, projected.y);
    if (candidate > Math.PI / 2) candidate -= Math.PI;
    if (candidate < -Math.PI / 2) candidate += Math.PI;
    // log(0) naturally gives infinite cost for an exactly end-on axis.
    const score = candidate * candidate - foreshorteningWeight * Math.log(length);
    if (score < bestScore) {
      bestScore = score;
      angle = candidate;
      axis = candidateAxis.multiplyScalar(projected.y < 0 ? -1 : 1);
    }
  }
  return { axis, angle };
}

/** Balance roll distance against foreshortening, then level the winning axis exactly. */
export function levelOrientation(view: OrbitView): THREE.Quaternion {
  view.camera.lookAt(view.target);
  view.camera.updateMatrixWorld();
  const orientation = view.camera.quaternion.clone();
  const { angle } = levelAxis(orientation);
  return orientation.multiply(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle),
  );
}
