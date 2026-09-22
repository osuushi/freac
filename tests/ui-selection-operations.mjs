import assert from "node:assert/strict";
import * as THREE from "three";
import { plate } from "./ui-body-fillet.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { browseTools, chooseTool, toolEnabled } from "./ui-tools.mjs";

const button = (page, name) => page.getByRole("button", { name, exact: true });
async function refine(page, name) {
  const id = {
    "Select owning bodies": "bodies",
    "Clear selection": "clear",
    "Only faces": "only-faces",
  }[name];
  assert.ok(id);
  await chooseTool(page, name, `selection-${id}`);
  return inspect(page);
}
async function capabilities(page) {
  const result = [];
  for (const category of ["Solid", "Transform"]) {
    await browseTools(page, category);
    result.push(
      ...(await page
        .locator("[data-command]")
        .evaluateAll((rows) =>
          rows
            .filter((row) =>
              ["extrude", "offset", "shell", "move", "fillet", "chamfer", "revolve"].includes(
                row.dataset.command,
              ),
            )
            .map((row) => [row.dataset.command, row.getAttribute("aria-disabled") === "false"]),
        )),
    );
    await page.keyboard.press("Escape");
  }
  return result.sort((a, b) => a[0].localeCompare(b[0]));
}
async function undo(page, original) {
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
}
async function offset(page, original) {
  await page.keyboard.press("o");
  assert.equal((await inspect(page)).modelingTool, "offset");
  await button(page, "Offset faces").click();
  await page.getByRole("textbox", { name: "Face offset distance", exact: true }).fill("1");
  const state = await inspect(page);
  assert.ok(state.preview.bodies[0].volume > original.bodies[0].volume);
  assert.deepEqual(state.document, original);
  await page.keyboard.press("Enter");
  const result = (await inspect(page)).document.bodies[0];
  await undo(page, original);
  return result;
}
async function marqueeBody(page, body) {
  // Actual marquee selects every face, including hidden faces; no test-only selection setter.
  const beforeMarquee = await inspect(page);
  const box = await page.locator("canvas").boundingBox();
  const camera = beforeMarquee.camera;
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
  const points = body.faces.flatMap((f) =>
    Array.from({ length: f.vertices.length / 3 }, (_, i) => {
      const p = new THREE.Vector3().fromArray(f.vertices, i * 3).project(view);
      return { x: box.x + ((p.x + 1) * box.width) / 2, y: box.y + ((1 - p.y) * box.height) / 2 };
    }),
  );
  await page.mouse.move(
    Math.min(...points.map((p) => p.x)) - 12,
    Math.min(...points.map((p) => p.y)) - 12,
  );
  await page.mouse.down();
  await page.mouse.move(
    Math.max(...points.map((p) => p.x)) + 12,
    Math.max(...points.map((p) => p.y)) + 12,
    { steps: 8 },
  );
  await page.mouse.up();
}

export async function selectionOperationsRoute(page, name) {
  const { center } = await plate(page);
  const original = (await inspect(page)).document;
  await refine(page, "Select owning bodies");
  const bodyCapabilities = await capabilities(page);
  assert.equal((await inspect(page)).modelingTool, "move");
  const bodyOffset = await offset(page, original);
  await refine(page, "Clear selection");
  await marqueeBody(page, original.bodies[0]);
  let state = await inspect(page);
  assert.equal(state.activePlane, null, "Marquee release must not enter a sketch plane");
  assert.equal(state.modelingSelection.length, original.bodies[0].faces.length);
  assert.ok(state.modelingSelection.every((t) => t.kind === "face"));
  assert.equal(state.modelingTool, "move");
  assert.deepEqual(await capabilities(page), bodyCapabilities);
  assert.ok(await toolEnabled(page, "duplicate bodies", "duplicate"));
  await button(page, "Move body X").click();
  await page.getByRole("textbox", { name: "Body translation X", exact: true }).fill("3");
  assert.deepEqual((await inspect(page)).document, original);
  await page.keyboard.press("Enter");
  state = await inspect(page);
  close(state.document.bodies[0].center[0], original.bodies[0].center[0] + 3);
  close(state.document.bodies[0].volume, original.bodies[0].volume);
  assert.equal(
    (await page.evaluate(() => window.freacHistory())).at(-1).operation.kind,
    "transform-bodies",
  );
  await undo(page, original);
  const restoredFaces = await refine(page, "Only faces");
  assert.ok(restoredFaces.modelingSelection.every((t) => t.kind === "face"));
  assert.equal(restoredFaces.modelingSelection.length, original.bodies[0].faces.length);
  const facesOffset = await offset(page, original);
  close(facesOffset.volume, bodyOffset.volume);
  facesOffset.bounds.forEach((v, i) => {
    close(v, bodyOffset.bounds[i]);
  });
  await refine(page, "Select owning bodies");
  // Toggle-click a face removes it from whole-body coverage, then restores it.
  await page.keyboard.down("Meta");
  await page.mouse.click(center.x + 35, center.y + 35);
  await page.keyboard.up("Meta");
  state = await inspect(page);
  assert.equal(state.modelingSelection.length, original.bodies[0].faces.length - 1);
  assert.equal(state.modelingTool, "offset");
  await page.keyboard.down("Meta");
  await page.mouse.click(center.x + 35, center.y + 35);
  await page.keyboard.up("Meta");
  assert.equal((await inspect(page)).modelingTool, "move");
  await page.keyboard.press("Delete");
  assert.deepEqual((await inspect(page)).document.bodies, []);
  assert.deepEqual((await inspect(page)).document.sketches, original.sketches);
  assert.equal(
    (await page.evaluate(() => window.freacHistory())).at(-1).operation.kind,
    "delete-entities",
  );
  await undo(page, original);
  console.log(
    `${name}: body/all-face capabilities, rigid Move, whole-face Offset, subtract/reselect and immediate Delete/Undo passed`,
  );
}
