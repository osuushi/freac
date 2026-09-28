import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { levelOrientation, SmoothedTurntable } from "../src/sketch/camera-orbit.js";

function view() {
  const camera = new THREE.OrthographicCamera(-40, 40, 40, -40);
  const target = new THREE.Vector3(3, 4, 5);
  camera.position.copy(target).add(new THREE.Vector3(0, 0, 120));
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  return { camera, target };
}
test("turntable uses starting pose independent of intervening events and reverses exactly", () => {
  const a = view(),
    b = view(),
    first = new SmoothedTurntable(),
    second = new SmoothedTurntable();
  const start = { x: 0.1, y: -0.4 },
    end = { x: 0.6, y: 0.2 };
  const original = a.camera.position.clone();
  first.begin(a, start);
  second.begin(b, start);
  first.drag(a, { x: -0.9, y: 0.2 });
  first.drag(a, end);
  second.drag(b, end);
  assert.ok(a.camera.position.distanceTo(b.camera.position) < 1e-10);
  assert.ok(a.camera.up.distanceTo(b.camera.up) < 1e-10);
  assert.ok(Math.abs(a.camera.position.distanceTo(a.target) - 120) < 1e-10);
  assert.deepEqual(a.target.toArray(), [3, 4, 5]);
  first.drag(a, start);
  assert.ok(a.camera.position.distanceTo(original) < 1e-10);
  first.end();
  first.drag(a, end);
  assert.ok(a.camera.position.distanceTo(original) < 1e-10);
});
test("center drags yaw and pitch without tilting the horizon before release", () => {
  const state = view(),
    orbit = new SmoothedTurntable();
  orbit.begin(state, { x: 0, y: 0 });
  orbit.drag(state, { x: 0.3, y: 0.2 });
  state.camera.lookAt(state.target);
  const upright = new THREE.Vector3(0, 1, 0).applyQuaternion(
    state.camera.quaternion.clone().invert(),
  );
  assert.ok(Math.abs(upright.x) < 1e-10, "World up stays vertical while dragging");
  assert.ok(state.camera.position.x < state.target.x, "Horizontal motion yaws");
  assert.ok(state.camera.position.y < state.target.y, "Vertical motion pitches");
  assert.ok(state.camera.quaternion.angleTo(levelOrientation(state)) < 1e-10);
});
test("two center drags turn the view through 180 degrees", () => {
  const state = view(),
    orbit = new SmoothedTurntable();
  for (let i = 0; i < 2; i++) {
    orbit.begin(state, { x: 0, y: 0 });
    orbit.drag(state, { x: Math.PI / 4, y: 0 });
    orbit.end();
  }
  assert.ok(Math.abs(state.camera.position.x - state.target.x) < 1e-10);
  assert.ok(Math.abs(state.camera.position.z - state.target.z + 120) < 1e-10);
});
test("outer ring rolls without changing viewing direction", () => {
  const state = view(),
    orbit = new SmoothedTurntable(),
    position = state.camera.position.clone();
  orbit.begin(state, { x: 2, y: 0 });
  orbit.drag(state, { x: 2, y: 2 });
  assert.ok(state.camera.position.distanceTo(position) < 1e-10);
  assert.ok(state.camera.up.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-10);
});
test("release orientation is an exact signed canonical horizon, preserving view direction", () => {
  for (let i = 0; i < 40; i++) {
    const state = view();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(i * 0.21, i * 0.37, i * 0.16));
    state.camera.position.sub(state.target).applyQuaternion(q).add(state.target);
    state.camera.up.applyQuaternion(q);
    state.camera.lookAt(state.target);
    const before = state.camera.quaternion.clone(),
      after = levelOrientation(state);
    const forward = new THREE.Vector3(0, 0, 1);
    assert.ok(
      forward.clone().applyQuaternion(before).distanceTo(forward.clone().applyQuaternion(after)) <
        1e-10,
    );
    const axes = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    ];
    assert.ok(
      axes.some((axis) => {
        const p = axis.clone().applyQuaternion(after.clone().invert());
        return Math.hypot(p.x, p.y) > 1e-6 && Math.abs(p.x) < 1e-10;
      }),
    );
  }
});

test("a foreshortened vertical axis loses to a clear horizon requiring some roll", () => {
  const state = view();
  state.camera.position
    .copy(state.target)
    .add(new THREE.Vector3(0.03, 0.995, 0.1).normalize().multiplyScalar(120));
  state.camera.up.set(0, 1, 0);
  state.camera.lookAt(state.target);
  const before = state.camera.quaternion.clone();
  const after = levelOrientation(state);
  const projectedZ = new THREE.Vector3(0, 0, 1).applyQuaternion(after.clone().invert());
  assert.ok(
    before.angleTo(after) > 0.1,
    "Prefer a visible axis even though Y already costs zero roll",
  );
  assert.ok(Math.abs(projectedZ.x) < 1e-10, "Z becomes exactly vertical");
});
test("a clear already-level horizon stays put, including an exactly end-on other axis", () => {
  const state = view();
  const before = state.camera.quaternion.clone();
  assert.ok(before.angleTo(levelOrientation(state)) < 1e-10);
});

test("broad annulus blends continuously between turntable and roll", () => {
  const dragAt = (radius: number) => {
    const state = view(),
      orbit = new SmoothedTurntable();
    orbit.begin(state, { x: radius, y: 0 });
    orbit.drag(state, { x: radius + 0.1, y: 0.1 });
    state.camera.lookAt(state.target);
    return state.camera.quaternion.clone();
  };
  for (const join of [0.7, 1.15]) {
    const h = 1e-5;
    assert.ok(dragAt(join - h).angleTo(dragAt(join + h)) < 0.0002);
  }
  const inside = view(),
    outside = view();
  const innerOrbit = new SmoothedTurntable(),
    outerOrbit = new SmoothedTurntable();
  innerOrbit.begin(inside, { x: 0.4, y: 0 });
  outerOrbit.begin(outside, { x: 1.2, y: 0 });
  innerOrbit.drag(inside, { x: 0.5, y: 0.1 });
  outerOrbit.drag(outside, { x: 1.3, y: 0.1 });
  assert.ok(inside.camera.position.distanceTo(view().camera.position) > 1);
  assert.ok(outside.camera.position.distanceTo(view().camera.position) < 1e-10);
});

test("blended ring roll passes the opposite bearing without a jump and unwinds", () => {
  const state = view(),
    orbit = new SmoothedTurntable(),
    original = state.camera.position.clone();
  orbit.begin(state, { x: 0.8, y: 0 });
  const point = (angle: number) => ({ x: 0.8 * Math.cos(angle), y: 0.8 * Math.sin(angle) });
  orbit.drag(state, point(Math.PI / 2));
  orbit.drag(state, point(Math.PI - 0.001));
  state.camera.lookAt(state.target);
  const before = state.camera.quaternion.clone();
  orbit.drag(state, point(Math.PI + 0.001));
  state.camera.lookAt(state.target);
  assert.ok(before.angleTo(state.camera.quaternion) < 0.01);
  for (const angle of [Math.PI - 0.001, Math.PI / 2, 0]) orbit.drag(state, point(angle));
  assert.ok(state.camera.position.distanceTo(original) < 1e-10);
});

test("off-center pivot stays at its screen position without a starting jump", () => {
  const state = view(),
    orbit = new SmoothedTurntable();
  const pivot = new THREE.Vector3(23, -7, -30);
  state.camera.updateMatrixWorld();
  const projected = pivot.clone().project(state.camera);
  const originalPosition = state.camera.position.clone(),
    originalTarget = state.target.clone();
  const start = { x: 0.2, y: -0.4 };
  orbit.begin(state, start, pivot);
  assert.ok(state.camera.position.equals(originalPosition));
  assert.ok(state.target.equals(originalTarget));
  orbit.drag(state, { x: -0.4, y: 0.3 });
  state.camera.lookAt(state.target);
  state.camera.updateMatrixWorld();
  assert.ok(pivot.clone().project(state.camera).distanceTo(projected) < 1e-10);
  assert.ok(state.target.distanceTo(originalTarget) > 1);
  orbit.drag(state, start);
  assert.ok(state.camera.position.distanceTo(originalPosition) < 1e-10);
  assert.ok(state.target.distanceTo(originalTarget) < 1e-10);
});
