import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { Arcball, levelOrientation, spherePoint } from "../src/sketch/camera-orbit.js";

function view() {
  const camera = new THREE.OrthographicCamera(-40, 40, 40, -40);
  const target = new THREE.Vector3(3, 4, 5);
  camera.position.copy(target).add(new THREE.Vector3(0, 0, 120));
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  return { camera, target };
}
test("Arcball uses starting pose independent of intervening events and reverses exactly", () => {
  const a = view(),
    b = view(),
    first = new Arcball(),
    second = new Arcball();
  const start = { x: 0.1, y: -0.7 },
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
test("bottom-center up drag rotates only about screen X and can cross poles", () => {
  const state = view(),
    orbit = new Arcball();
  orbit.begin(state, { x: 0, y: -0.8 });
  orbit.drag(state, { x: 0, y: 0.8 });
  assert.ok(Math.abs(state.camera.position.x - state.target.x) < 1e-10);
  assert.ok(Math.abs(state.camera.up.x) < 1e-10);
  assert.ok(state.camera.position.z < state.target.z);
});
test("outside sphere projects to equator and rolls without changing viewing direction", () => {
  assert.deepEqual(spherePoint({ x: 2, y: 0 }).toArray(), [1, 0, 0]);
  const state = view(),
    orbit = new Arcball(),
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

test("rounded rim joins the sphere and pure-roll region with continuous angular speed", () => {
  const angle = (radius: number) => {
    const point = spherePoint({ x: radius, y: 0 });
    assert.ok(Math.abs(point.length() - 1) < 1e-12);
    return Math.atan2(point.x, point.z);
  };
  const h = 1e-6;
  for (const join of [0.8, 1]) {
    const left = (angle(join) - angle(join - h)) / h;
    const right = (angle(join + h) - angle(join)) / h;
    assert.ok(Math.abs(left - right) < 0.0002, "No speed discontinuity at either join");
  }
  let previous = angle(0);
  for (let i = 1; i <= 200; i++) {
    const current = angle(i / 100);
    assert.ok(current >= previous - 1e-12, "Radial motion never reverses");
    previous = current;
  }
  assert.ok(Math.abs(angle(0.5) - Math.asin(0.5)) < 1e-12);
  assert.equal(angle(1.2), Math.PI / 2);
});
