import assert from "node:assert/strict";
import * as THREE from "three";
import { orient } from "./ui-blend-edit.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const center = async (locator) => {
  const b = await locator.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
async function pointerDrag(page, from, to, command = false) {
  if (command) await page.keyboard.down("Meta");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  if (command) await page.keyboard.up("Meta");
  await inspect(page);
}
async function projection(page) {
  const { camera: c } = await inspect(page),
    b = await page.locator("canvas").boundingBox();
  const camera = new THREE.OrthographicCamera(
    (-c.height * b.width) / b.height / 2,
    (c.height * b.width) / b.height / 2,
    c.height / 2,
    -c.height / 2,
    0.1,
    10000,
  );
  camera.position.fromArray(c.position);
  camera.up.fromArray(c.up);
  camera.lookAt(new THREE.Vector3(...c.target));
  camera.updateMatrixWorld();
  return {
    camera,
    b,
    point(p) {
      const q = new THREE.Vector3(...p).project(camera);
      return { x: b.x + ((q.x + 1) * b.width) / 2, y: b.y + ((1 - q.y) * b.height) / 2 };
    },
    ray(p) {
      const r = new THREE.Raycaster();
      r.setFromCamera(
        new THREE.Vector2(((p.x - b.x) / b.width) * 2 - 1, 1 - ((p.y - b.y) / b.height) * 2),
        camera,
      );
      return r.ray;
    },
  };
}
async function rotationCheck(page, pivot, axis, before, gesture = false) {
  const marker = page.getByRole("button", { name: `Rotate body ${axis}`, exact: true });
  if (gesture) {
    const anchor = await center(
      page.getByRole("button", { name: "Reposition body pivot", exact: true }),
    );
    const from = await center(marker);
    await pointerDrag(page, from, {
      x: anchor.x + from.y - anchor.y,
      y: anchor.y - from.x + anchor.x,
    });
  } else {
    await marker.click();
    await page.locator(".body-transform-value").fill("90");
    await page.keyboard.press("Enter");
  }
  const after = (await inspect(page)).document.bodies[0];
  const direction = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[axis];
  const expected = new THREE.Vector3(...before.center)
    .sub(new THREE.Vector3(...pivot))
    .applyAxisAngle(new THREE.Vector3(...direction), Math.PI / 2)
    .add(new THREE.Vector3(...pivot));
  assert.ok(
    expected.distanceTo(new THREE.Vector3(...after.center)) < 1e-5,
    `rotation ${axis} uses anchor ${pivot}; got ${after.center}, expected ${expected.toArray()}`,
  );
  await chooseTool(page, "undo", "undo");
  await inspect(page);
}
async function sketchAnchors(page, name) {
  for (const plane of ["XY", "XZ", "YZ"]) {
    await reset(page);
    await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
    await chooseTool(page, "grid snap", "grid");
    await page.keyboard.press("l");
    await drag(page, [-10, -5], [10, 5]);
    await page.keyboard.press("v");
    const mid = await at(page, 0, 0);
    await page.mouse.click(mid.x, mid.y);
    await page.keyboard.press("m");
    const before = await inspect(page),
      anchor = page.getByRole("button", { name: "Reposition sketch pivot", exact: true });
    assert.equal(await page.locator("[data-move-marker]").count(), 3);
    const target = await at(page, 10, 5);
    await pointerDrag(page, await center(anchor), { x: target.x + 3, y: target.y - 2 });
    let actual = await center(anchor);
    assert.ok(Math.hypot(actual.x - target.x, actual.y - target.y) < 0.1);
    await pointerDrag(page, actual, { x: target.x + 5, y: target.y - 4 }, true);
    actual = await center(anchor);
    assert.ok(Math.hypot(actual.x - target.x - 5, actual.y - target.y + 4) < 0.1);
    assert.equal(
      (await inspect(page)).activePlane,
      plane,
      "Command anchor drag preserves sketch workspace",
    );
    assert.deepEqual((await inspect(page)).document, before.document);
    await page.mouse.move(actual.x, actual.y);
    await page.mouse.down();
    await page.mouse.move(actual.x + 40, actual.y + 30);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.deepEqual(await center(anchor), actual);
    await sketchRotationDrag(page, anchor, before);
    await page.screenshot({ path: `.cache/sketch-review/${name}-widget-${plane}.png` });
  }
}
async function bodyAnchors(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("r");
  await drag(page, [-4, -4], [16, 8]);
  const pick = await at(page, 3, 2);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.keyboard.press("m");
  const anchor = page.getByRole("button", { name: "Reposition body pivot", exact: true }),
    root = page.locator(
      ".body-gizmo:not([hidden]):not(.topology-move-gizmo):not(.sketch-placement-gizmo)",
    );
  assert.equal(await root.getAttribute("data-mode"), "2d");
  assert.equal(await root.locator(".body-translate-handle:visible").count(), 2);
  assert.equal(await root.locator(".body-rotate-handle:visible").count(), 1);
  const original = (await inspect(page)).document,
    body = original.bodies[0];
  // The origin is occluded by the box. Off-center hover must remain free, not snap behind it.
  const project = await projection(page),
    origin = project.point([0, 0, 0]);
  await pointerDrag(page, await center(anchor), { x: origin.x + 6, y: origin.y + 5 });
  let actual = await center(anchor);
  assert.ok(Math.hypot(actual.x - origin.x - 6, actual.y - origin.y - 5) < 0.1);
  // A visible top vertex wins even though it lies off the anchor's free plane.
  const vertex = [16, 8, 5],
    target = project.point(vertex);
  await pointerDrag(page, actual, { x: target.x - 3, y: target.y + 2 });
  actual = await center(anchor);
  assert.ok(Math.hypot(actual.x - target.x, actual.y - target.y) < 0.1);
  await rotationCheck(page, vertex, "Z", body, true);
  await spatialAnchor(page, name, anchor, root, vertex, original, body);
}
async function spatialAnchor(page, name, anchor, root, vertex, original, body) {
  // Orbit through the real Command gesture, then verify the three-axis mode.
  await orient(page, [1, 1, 1]);
  assert.equal(await root.getAttribute("data-mode"), "3d");
  assert.equal(await root.locator(".body-translate-handle:visible").count(), 3);
  assert.equal(await root.locator(".body-rotate-handle:visible").count(), 3);
  const project = await projection(page);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(project.camera.quaternion);
  const direction = project.camera.getWorldDirection(new THREE.Vector3());
  const canonical = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const upright = canonical.reduce((a, b) =>
    Math.abs(up.dot(new THREE.Vector3(...b))) /
      Math.sqrt(1 - direction.dot(new THREE.Vector3(...b)) ** 2) >
    Math.abs(up.dot(new THREE.Vector3().fromArray(a))) /
      Math.sqrt(1 - direction.dot(new THREE.Vector3().fromArray(a)) ** 2)
      ? b
      : a,
  );
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    new THREE.Vector3(...upright),
    new THREE.Vector3(...vertex),
  );
  const from = await center(anchor),
    to = { x: from.x - 45, y: from.y + 30 };
  const first = project.ray(from).intersectPlane(plane, new THREE.Vector3()),
    last = project.ray(to).intersectPlane(plane, new THREE.Vector3());
  const expected = new THREE.Vector3(...vertex).add(last.sub(first)).toArray();
  await pointerDrag(page, from, to, true);
  assert.deepEqual((await inspect(page)).document, original);
  await rotationCheck(page, expected, "X", body);
  await rotationCheck(page, expected, "Z", body);
  await page.screenshot({ path: `.cache/sketch-review/${name}-widget-oblique.png` });
  const size = await root.locator('.body-translate-handle[data-axis="X"]').boundingBox();
  await page.mouse.move(850, 600);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -12);
  await page.keyboard.up("Control");
  await inspect(page);
  const zoomed = await root.locator('.body-translate-handle[data-axis="X"]').boundingBox();
  assert.equal(size.width, zoomed.width);
  assert.equal(size.height, zoomed.height);
  await page.screenshot({ path: `.cache/sketch-review/${name}-widget-3d.png` });
  for (const view of [
    [1, -1, 0],
    [1, 1, 0],
  ]) {
    await orient(page, view);
    assert.equal(await root.locator('.body-rotate-handle[data-axis="Z"]').isVisible(), false);
    const projectionState = await projection(page);
    const anchorScreen = await center(anchor);
    const unit = (projectionState.camera.top * 2) / projectionState.b.height;
    const origin = projectionState.point([0, 0, 0]);
    for (const axis of ["X", "Y"]) {
      const normal = axis === "X" ? [0, 72 * unit, 72 * unit] : [72 * unit, 0, 72 * unit];
      const target = projectionState.point(normal);
      const marker = await center(root.locator(`.body-rotate-handle[data-axis="${axis}"]`));
      assert.ok(
        Math.hypot(
          marker.x - anchorScreen.x - target.x + origin.x,
          marker.y - anchorScreen.y - target.y + origin.y,
        ) < 0.1,
        "rotation marker stays at its rigid 45 degree world offset",
      );
    }
  }
  await page.screenshot({ path: `.cache/sketch-review/${name}-widget-diagonal.png` });
  console.log(
    `${name}: sketch anchor/snap/Command/cancel on XY/XZ/YZ; 2D/3D, visible vertex, occluded origin, upright-plane anchor rotations and constant screen scale passed`,
  );
}

export async function moveWidgetRoute(page, name) {
  await sketchAnchors(page, name);
  await bodyAnchors(page, name);
  await faceCenterAnchors(page, name);
}

async function faceCenterAnchors(page, name) {
  for (const kind of ["rectangle", "circle"]) {
    await reset(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await chooseTool(page, "grid snap", "grid");
    await page.keyboard.press(kind === "circle" ? "c" : "r");
    await drag(page, kind === "circle" ? [0, 0] : [-10, -6], kind === "circle" ? [6, 0] : [10, 6]);
    const pick = await at(page, 2, 1);
    await chooseTool(page, "return to modeling", "modeling");
    await page.mouse.click(pick.x, pick.y);
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
    await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
    await page.keyboard.press("Enter");
    await inspect(page);
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
    await page.keyboard.press("m");
    const anchor = page.getByRole("button", { name: "Reposition body pivot", exact: true });
    const before = (await inspect(page)).document.bodies[0];
    const origin = await center(anchor);
    await pointerDrag(page, origin, { x: origin.x - 40, y: origin.y + 30 }, true);
    await pointerDrag(page, await center(anchor), { x: origin.x + 3, y: origin.y + 2 });
    const actual = await center(anchor);
    assert.ok(Math.hypot(actual.x - origin.x, actual.y - origin.y) < 0.1);
    await orient(page, [1, 1, 1]);
    await rotationCheck(page, [0, 0, 5], "X", before);
    await page.screenshot({ path: `.cache/sketch-review/${name}-widget-${kind}-center.png` });
  }
  console.log(
    `${name}: visible rectangular and circular face centers snap at their actual 3D positions`,
  );
}

async function sketchRotationDrag(page, anchor, before) {
  const origin = await at(page, 0, 0),
    unit = await at(page, 1, 1);
  const pivot = await center(anchor);
  const local = {
    x: (pivot.x - origin.x) / (unit.x - origin.x),
    y: (pivot.y - origin.y) / (unit.y - origin.y),
  };
  const from = await center(page.locator('[data-move-marker="rotation"] > svg'));
  await page.keyboard.down("Shift");
  await pointerDrag(page, from, { x: pivot.x + from.y - pivot.y, y: pivot.y - from.x + pivot.x });
  await page.keyboard.up("Shift");
  const curve = (await inspect(page)).document.sketches[0].curves[0];
  const source = before.document.sketches[0].curves[0];
  for (const end of ["a", "b"]) {
    assert.ok(Math.abs(curve[end].x - (local.x - source[end].y + local.y)) < 1e-5);
    assert.ok(Math.abs(curve[end].y - (local.y + source[end].x - local.x)) < 1e-5);
  }
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before.document);
}
