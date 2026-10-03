import * as THREE from "three";
export type OrbitPointer = { x: number; y: number };
type OrbitView = { camera: THREE.OrthographicCamera; target: THREE.Vector3 };

const rotationPerRadius = 2;

/** Press-based turntable; roll is an explicit modifier, never a screen region. */
export class SmoothedTurntable {
  private start: {
    point: OrbitPointer;
    orientation: THREE.Quaternion;
    offset: THREE.Vector3;
    targetOffset: THREE.Vector3;
    pivot: THREE.Vector3;
    upAxis: THREE.Vector3;
    roll: boolean;
    orbitPivot: THREE.Vector3;
    last: OrbitPointer;
  } | null = null;
  get active(): boolean {
    return this.start !== null;
  }
  get rolling(): boolean {
    return this.start?.roll ?? false;
  }
  end(): void {
    this.start = null;
  }
  begin(view: OrbitView, from: OrbitPointer, orbitPivot = view.target, roll = false): void {
    const pivot = roll ? view.target : orbitPivot;
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
      roll,
      orbitPivot: orbitPivot.clone(),
      last: { ...from },
    };
  }
  drag(view: OrbitView, to: OrbitPointer, roll = false): void {
    if (!this.start) return;
    if (roll !== this.start.roll) this.begin(view, this.start.last, this.start.orbitPivot, roll);
    const { point, orientation, offset, targetOffset, pivot, upAxis } = this.start;
    this.start.last = { ...to };
    const yaw = roll ? 0 : -rotationPerRadius * (to.x - point.x);
    const pitch = roll ? 0 : rotationPerRadius * (to.y - point.y);
    const rollAngle = roll ? rotationPerRadius * (to.x - point.x) : 0;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(orientation);
    const viewAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(orientation);
    const rotation = new THREE.Quaternion()
      .setFromAxisAngle(upAxis, yaw)
      .multiply(new THREE.Quaternion().setFromAxisAngle(right, pitch))
      .multiply(new THREE.Quaternion().setFromAxisAngle(viewAxis, rollAngle));
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
