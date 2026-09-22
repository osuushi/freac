import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  alignCameraToPlane,
  applyCameraPose,
  panCamera,
  planeCameraPose,
  zoomCamera,
} from "../src/sketch/camera-motion.js";
import { planes } from "../src/sketch/planes.js";

test("plane alignment chooses the closest axis-aligned side and roll", () => {
  const camera = new THREE.OrthographicCamera();
  camera.position.set(55, -70, 65);
  camera.up.set(0, 0, 1);
  const view = { camera, target: new THREE.Vector3(), height: 80 };
  camera.lookAt(view.target);
  camera.updateMatrixWorld();
  alignCameraToPlane(view, planes.XZ);
  camera.lookAt(view.target);
  camera.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  assert.ok(camera.position.y < 0, "entry keeps the nearer side of the plane");
  assert.ok(right.dot(new THREE.Vector3(...planes.XZ.u)) > 0.999999);
  assert.ok(up.dot(new THREE.Vector3(...planes.XZ.v)) > 0.999999);
});

test("plane alignment preserves the nearest in-plane half-turn when it is already aligned", () => {
  const camera = new THREE.OrthographicCamera();
  camera.position.set(0, -120, 0);
  camera.up.set(0, 0, -1);
  const view = { camera, target: new THREE.Vector3(), height: 80 };
  camera.lookAt(view.target);
  camera.updateMatrixWorld();
  alignCameraToPlane(view, planes.XZ);
  camera.lookAt(view.target);
  camera.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  assert.ok(right.dot(new THREE.Vector3(...planes.XZ.u)) < -0.999999);
  assert.ok(up.dot(new THREE.Vector3(...planes.XZ.v)) < -0.999999);
});

test("plane framing carries a region target and orthographic height into one pose", () => {
  const camera = new THREE.OrthographicCamera();
  camera.position.set(55, -70, 65);
  camera.up.set(0, 0, 1);
  const view = { camera, target: new THREE.Vector3(), height: 80 },
    pose = planeCameraPose(view, planes.XY, { target: [30, 22, 0], height: 10 });
  applyCameraPose(view, pose);
  camera.lookAt(view.target);
  camera.updateMatrixWorld();
  assert.deepEqual(view.target.toArray(), [30, 22, 0]);
  assert.equal(view.height, 10);
  assert.ok(Math.abs(camera.position.distanceTo(view.target) - 120) < 1e-9);
  assert.ok(
    new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).dot(new THREE.Vector3(0, 1, 0)) >
      0.999999,
  );
});

test("pan translates camera and target equally; pointer-centered zoom respects limits", () => {
  const camera = new THREE.OrthographicCamera();
  camera.position.set(0, 0, 120);
  camera.up.set(0, 1, 0);
  const view = { camera, target: new THREE.Vector3(), height: 80 };
  camera.lookAt(view.target);
  camera.updateMatrixWorld();
  panCamera(view, 100, 50, 800);
  assert.deepEqual(view.target.toArray(), [-10, 5, 0]);
  assert.deepEqual(camera.position.toArray(), [-10, 5, 120]);
  zoomCamera(view, 0.5, { x: 200, y: -100 }, 800);
  assert.equal(view.height, 40);
  assert.deepEqual(view.target.toArray(), [0, 10, 0]);
  assert.deepEqual(camera.position.toArray(), [0, 10, 120]);
  zoomCamera(view, 1e10, { x: 0, y: 0 }, 800);
  assert.equal(view.height, 10000);
  zoomCamera(view, 1e-10, { x: 0, y: 0 }, 800);
  assert.equal(view.height, 0.5);
});
