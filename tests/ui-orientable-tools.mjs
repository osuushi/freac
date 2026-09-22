import assert from "node:assert/strict";
import * as THREE from "three";
import { orient } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";

const arrowContours = [
  [
    [0, 0],
    [24, 0],
  ],
  [
    [14, -8],
    [24, 0],
    [14, 8],
  ],
];

/** Check a rigid frame against an independent camera projection during actual navigation. */
export async function orientableArrowViews(page, handle, root, normal, name, section = null) {
  const original = (await inspect(page)).document;
  const canonical = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const n = new THREE.Vector3(...normal);
  const reference = canonical.reduce((a, b) =>
    Math.abs(n.dot(new THREE.Vector3().fromArray(a))) <= Math.abs(n.dot(new THREE.Vector3(...b)))
      ? a
      : b,
  );
  const width = new THREE.Vector3(...reference)
    .addScaledVector(n, -n.dot(new THREE.Vector3(...reference)))
    .normalize();
  async function check() {
    const { camera: state } = await inspect(page);
    const camera = new THREE.PerspectiveCamera();
    camera.position.fromArray(state.position);
    camera.up.fromArray(state.up);
    camera.lookAt(new THREE.Vector3(...state.target));
    const inverse = camera.quaternion.clone().invert();
    const u = n.clone().applyQuaternion(inverse);
    const facing = section
      ? new THREE.Vector3(...section)
      : n.clone().cross(camera.getWorldDirection(new THREE.Vector3()));
    if (facing.lengthSq() < 1e-12) {
      facing.set(1, 0, 0).applyQuaternion(camera.quaternion);
      facing.addScaledVector(n, -facing.dot(n));
    }
    const v = facing.normalize().applyQuaternion(inverse);
    const placementWidth = width.clone().applyQuaternion(inverse);
    const b = await handle.boundingBox(),
      anchor = await root.boundingBox();
    assert.equal(b.width, 64);
    assert.equal(b.height, 64);
    assert.ok(Math.abs(b.x + 32 - anchor.x - u.x * 48 - placementWidth.x * 32) < 0.1);
    assert.ok(Math.abs(b.y + 32 - anchor.y + u.y * 48 + placementWidth.y * 32) < 0.1);
    const paths = await handle.locator("svg path").evaluateAll((elements) =>
      elements.map((p) => ({
        d: p.getAttribute("d"),
        stroke: p.getAttribute("stroke"),
        width: p.getAttribute("stroke-width"),
      })),
    );
    assert.ok(paths.length >= 6, "A tool-specific contour accompanies the drag arrow");
    paths.forEach((p, i) => {
      assert.equal(p.stroke, i < paths.length / 2 ? "#151515" : "#fff");
      assert.equal(p.width, i < paths.length / 2 ? "7" : "4");
    });
    for (const [index, points] of arrowContours.entries()) {
      const coords = paths[index].d.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
      const expected = points.flatMap(([x, y]) => [u.x * x + v.x * y, -u.y * x - v.y * y]);
      coords.forEach((value, i) => {
        assert.ok(Math.abs(value - expected[i]) < 1e-8);
      });
    }
  }
  await check();
  await page.screenshot({ path: `.cache/sketch-review/${name}-front.png` });
  for (let i = 0; i < 6; i++) {
    await orient(page, [0.15 + i * 0.2, -0.1 - i * 0.1, 1]);
    await check();
  }
  await page.screenshot({ path: `.cache/sketch-review/${name}-oblique.png` });
  const before = (await inspect(page)).camera.height;
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -45);
  await page.keyboard.up("Control");
  await page.waitForFunction((before) => window.freacInspect().camera.height !== before, before);
  await check();
  assert.deepEqual((await inspect(page)).document, original);
}
