import assert from "node:assert/strict";
import * as THREE from "three";
import { cylinderSeamRoute } from "./ui-cylinder-seam.mjs";
import { boldHiddenEdges } from "./ui-edge-highlight.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { browseTools, chooseTool } from "./ui-tools.mjs";

export async function bodyEdgesRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  await page.keyboard.press("c");
  await drag(page, [0, 0], [3, 0]);
  const holeEdge = await at(page, 3, 0),
    opposite = await at(page, -3, 0);
  const facePoint = await at(page, 6, 6),
    topEdge = await at(page, 0, 10),
    leftEdge = await at(page, -10, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(facePoint.x, facePoint.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  const original = (await inspect(page)).document;
  const body = original.bodies[0];
  close(body.volume, (400 - 9 * Math.PI) * 5);
  await page.mouse.move(topEdge.x, topEdge.y);
  assert.equal((await inspect(page)).modelingHover, "edge");
  await page.mouse.click(topEdge.x, topEdge.y);
  let selection = (await inspect(page)).modelingSelection;
  assert.equal(selection[0].kind, "edge");
  const edge = body.edges.find((e) => e.id === selection[0].edge);
  assert.ok(
    edge.points.every((value, i) => i % 3 !== 2 || Math.abs(value - 5) < 1e-6),
    "Visible top edge wins over bottom edge and sketch below",
  );
  await page.keyboard.down("Shift");
  await page.mouse.click(leftEdge.x, leftEdge.y);
  await page.keyboard.up("Shift");
  assert.equal((await inspect(page)).modelingSelection.length, 2);
  await page.keyboard.down("Meta");
  await page.mouse.click(topEdge.x, topEdge.y);
  await page.keyboard.up("Meta");
  assert.equal((await inspect(page)).modelingSelection.length, 1);
  await circularRim(page, body, holeEdge, opposite);
  await page.mouse.click(facePoint.x, facePoint.y);
  selection = (await inspect(page)).modelingSelection;
  assert.equal(selection[0].kind, "face");
  const face = body.faces.find((f) => f.id === selection[0].face);
  assert.equal(face.edges.length, 5);
  await browseTools(page, "Select");
  await chooseTool(page, "select face boundary edges", "selection-boundary");
  selection = (await inspect(page)).modelingSelection;
  assert.deepEqual(selection.map((t) => t.edge).sort(), [...face.edges].sort());
  assert.ok(selection.every((t) => t.kind === "edge"));
  assert.equal(await page.getByRole("dialog", { name: "Find a tool" }).isVisible(), false);
  await page.screenshot({ path: `.cache/sketch-review/${name}-body-boundary.png` });
  await page.getByRole("button", { name: "Hide Body 1", exact: true }).click();
  await page.mouse.move(topEdge.x, topEdge.y);
  assert.notEqual((await inspect(page)).modelingHover, "edge");
  await page.getByRole("button", { name: "Show Body 1", exact: true }).click();
  await adjacentFaces(page, body);
  await boldHiddenEdges(page, name);
  assert.deepEqual(
    (await inspect(page)).document,
    original,
    "Edge selection never changes geometry or adds an edit",
  );
  await chooseTool(page, "undo", "undo");
  assert.equal(
    ((await inspect(page)).document.bodies ?? []).length,
    0,
    "One Undo still undoes the extrusion",
  );
  await cylinderSeamRoute(page, name);
  console.log(
    `${name}: visible edge hover/picking, multiselection, occlusion, hole and adjacent-face boundaries, no geometry/history mutation passed`,
  );
}

async function adjacentFaces(page, body) {
  await page.mouse.move(1000, 650);
  await page.keyboard.down("Alt");
  await page.mouse.wheel(60, -80);
  await page.keyboard.up("Alt");
  const { camera } = await inspect(page),
    box = await page.locator("canvas").boundingBox();
  const h = camera.height / 2,
    w = (h * box.width) / box.height;
  const view = new THREE.OrthographicCamera(-w, w, h, -h, 0.1, 10000);
  view.position.fromArray(camera.position);
  view.up.fromArray(camera.up);
  view.lookAt(new THREE.Vector3(...camera.target));
  view.updateMatrixWorld();
  const normal = (f) => new THREE.Vector3(...f.plane.u).cross(new THREE.Vector3(...f.plane.v));
  const side = body.faces.find(
    (f) => f.plane && Math.abs(normal(f).z) < 0.1 && normal(f).dot(view.position) > 1,
  );
  assert.ok(side);
  const click = async (p, shift = false) => {
    const q = new THREE.Vector3(...p).project(view);
    if (shift) await page.keyboard.down("Shift");
    await page.mouse.click(
      box.x + ((q.x + 1) * box.width) / 2,
      box.y + ((1 - q.y) * box.height) / 2,
    );
    if (shift) await page.keyboard.up("Shift");
  };
  const hidden = body.edges.find(
    (e) =>
      e.curve?.kind === "line" &&
      e.points.every((v, i) => i % 3 !== 2 || Math.abs(v) < 1e-6) &&
      (e.points[0] + e.points[3]) * camera.position[0] +
        (e.points[1] + e.points[4]) * camera.position[1] <
        -1,
  );
  assert.ok(hidden);
  const hiddenMidpoint = [0, 1, 2].map((i) => (hidden.points[i] + hidden.points[i + 3]) / 2);
  await click(hiddenMidpoint);
  assert.notEqual(
    (await inspect(page)).modelingSelection[0]?.kind,
    "edge",
    "A rear edge occluded by the body cannot be selected through a face",
  );
  await click([6, 6, 5]);
  const midpoint = [0, 1, 2].map(
    (axis) =>
      side.vertices.filter((_, i) => i % 3 === axis).reduce((a, b) => a + b, 0) /
      (side.vertices.length / 3),
  );
  await click(midpoint, true);
  let selection = (await inspect(page)).modelingSelection;
  assert.equal(selection.length, 2);
  assert.ok(selection.every((t) => t.kind === "face"));
  await browseTools(page, "Select");
  await chooseTool(page, "select face boundary edges", "selection-boundary");
  selection = (await inspect(page)).modelingSelection;
  assert.equal(selection.length, 7, "Five cap edges plus four side edges minus shared edge twice");
}

async function circularRim(page, body, holeEdge, opposite) {
  await page.mouse.click(holeEdge.x, holeEdge.y);
  const selection = (await inspect(page)).modelingSelection;
  assert.equal(selection[0].kind, "edge");
  assert.equal(body.edges.find((e) => e.id === selection[0].edge)?.curve?.kind, "circle");
  await page.mouse.click(opposite.x, opposite.y);
  assert.deepEqual(
    (await inspect(page)).modelingSelection,
    selection,
    "Both halves select the same circular rim",
  );
}
