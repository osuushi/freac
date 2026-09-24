import assert from "node:assert/strict";
import * as THREE from "three";
import { orient } from "./ui-blend-edit.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function faceView(page, face) {
  const normal = new THREE.Vector3(...face.plane.u).cross(new THREE.Vector3(...face.plane.v));
  await orient(page, normal.toArray());
  const current = (await inspect(page)).camera;
  const bounds = await page.locator("canvas").boundingBox();
  assert.ok(bounds);
  const h = current.height / 2,
    w = (h * bounds.width) / bounds.height;
  const projection = new THREE.OrthographicCamera(-w, w, h, -h, 0.1, 10000);
  projection.position.fromArray(current.position);
  projection.up.fromArray(current.up);
  projection.lookAt(new THREE.Vector3(...current.target));
  projection.updateMatrixWorld();
  const point = new THREE.Vector3()
    .fromArray(face.vertices, 0)
    .add(new THREE.Vector3().fromArray(face.vertices, 3))
    .add(new THREE.Vector3().fromArray(face.vertices, 6))
    .multiplyScalar(1 / 3)
    .project(projection);
  await page.mouse.click(
    bounds.x + ((point.x + 1) * bounds.width) / 2,
    bounds.y + ((1 - point.y) * bounds.height) / 2,
  );
  if ((await inspect(page)).modelingSelection[0]?.kind === "profile")
    await chooseTool(page, "select face", "select-face");
  assert.equal((await inspect(page)).modelingSelection[0]?.face, face.id);
}
export async function solidFacesRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  await page.keyboard.press("c");
  await drag(page, [0, 0], [3, 0]);
  const region = await at(page, 6, 6);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(region.x, region.y);
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  let state = await inspect(page);
  const sketch = state.document.sketches[0];
  const segments = sketch.curves.filter((curve) => curve.kind === "segment");
  const circle = sketch.curves.find((curve) => curve.kind === "circle");
  const xs = segments.flatMap((curve) => [curve.a.x, curve.b.x]);
  const ys = segments.flatMap((curve) => [curve.a.y, curve.b.y]);
  close(
    state.document.bodies[0].volume,
    ((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) -
      Math.PI * circle.radius ** 2) *
      5,
  );
  const hideSource = page.getByRole("button", { name: "Hide Sketch 1", exact: true });
  if (await hideSource.count()) await hideSource.click();
  const body = state.document.bodies[0];
  const faces = body.faces.filter((f) => f.plane);
  const normal = (face) =>
    new THREE.Vector3(...face.plane.u).cross(new THREE.Vector3(...face.plane.v));
  for (const face of [
    faces.find((f) => normal(f).x > 0.9),
    faces.find((f) => normal(f).z < -0.9),
  ]) {
    assert.ok(face);
    await faceView(page, face);
    await chooseTool(page, "sketch on face", "sketch-on-face");
    await page.keyboard.press("l");
    await drag(page, [20, 20], [25, 20]);
    state = await inspect(page);
    assert.deepEqual(state.document.sketches.at(-1).plane, face.plane);
    assert.equal(state.document.sketches.at(-1).curves.length, 1);
    assert.equal(state.document.bodies[0].brep, body.brep);
    await chooseTool(page, "return to modeling", "modeling");
  }
  await page.screenshot({ path: `.cache/sketch-review/${name}-side-bottom-workspaces.png` });
}
