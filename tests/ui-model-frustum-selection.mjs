import assert from "node:assert/strict";
import * as THREE from "three";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

function projected(face, camera, box) {
  const view = new THREE.OrthographicCamera(
    (-camera.height * box.width) / box.height / 2,
    (camera.height * box.width) / box.height / 2,
    camera.height / 2,
    -camera.height / 2,
    0.1,
    10000,
  );
  view.position.fromArray(camera.position);
  view.up.fromArray(camera.up);
  view.lookAt(new THREE.Vector3(...camera.target));
  view.updateMatrixWorld();
  return Array.from({ length: face.vertices.length / 3 }, (_, index) => {
    const point = new THREE.Vector3().fromArray(face.vertices, index * 3).project(view);
    return {
      x: box.x + ((point.x + 1) * box.width) / 2,
      y: box.y + ((1 - point.y) * box.height) / 2,
    };
  });
}

export async function modelFrustumSelectionRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  await drag(page, [-10, -8], [10, 8]);
  const region = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(region.x, region.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("5");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.mouse.move(1000, 650);
  await page.keyboard.down("Alt");
  await page.mouse.wheel(60, -80);
  await page.keyboard.up("Alt");
  const before = await inspect(page),
    box = await page.locator("canvas").boundingBox();
  assert.ok(box);
  const body = before.document.bodies[0],
    face = body.faces.find((item) => item.plane && item.plane.u[0] === 1);
  assert.ok(face);
  const points = projected(face, before.camera, box);
  const bounds = {
    left: Math.min(...points.map((point) => point.x)) - 4,
    right: Math.max(...points.map((point) => point.x)) + 4,
    top: Math.min(...points.map((point) => point.y)) - 4,
    bottom: Math.max(...points.map((point) => point.y)) + 4,
  };
  const expected = body.faces
    .filter((item) =>
      projected(item, before.camera, box).every(
        (point) =>
          point.x >= bounds.left &&
          point.x <= bounds.right &&
          point.y >= bounds.top &&
          point.y <= bounds.bottom,
      ),
    )
    .map((item) => item.id)
    .sort();
  await page.mouse.move(bounds.left, bounds.top);
  await page.mouse.down();
  await page.mouse.move(bounds.right, bounds.bottom, { steps: 8 });
  await page.mouse.up();
  const after = await inspect(page);
  assert.deepEqual(
    after.modelingSelection.map((target) => target.face).sort(),
    expected,
    "The modeling marquee selects fully contained faces",
  );
  assert.deepEqual(after.document, before.document, "Marquee selection does not edit geometry");
  console.log(`${name}: model-space frustum selection and non-mutating face marquee passed`);
}
