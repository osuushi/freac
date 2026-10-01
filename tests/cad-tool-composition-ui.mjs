import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
async function cut(page) {
  await page.keyboard.press("Escape");
  await inspect(page);
  await orient(page, [1, -1, 1]);
  const { camera } = await inspect(page);
  const viewport = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
  await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, Math.log(40 / camera.height) / 0.01);
  await page.keyboard.up("Control");
  await inspect(page);
  // Pick inside the upper side face, away from the symmetric sweep's middle boundary.
  await worldClick(page, [0, -6, 10.75]);
  const selected = await inspect(page);
  assert.equal(
    selected.modelingSelection[0]?.kind,
    "face",
    JSON.stringify({
      selection: selected.modelingSelection,
      interaction: selected.interaction,
    }),
  );
  const before = selected.document.bodies[0];
  await chooseTool(page, "imprint", "imprint");
  await pickPlane(page, "YZ");
  await inspect(page);
  await page.keyboard.press("Enter");
  const imprinted = (await inspect(page)).document;
  near(imprinted.bodies[0].volume, 720);
  assert.ok(imprinted.bodies[0].faces.length > before.faces.length);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "split body", "split");
  await pickPlane(page, "YZ");
  await inspect(page);
  await page.keyboard.press("Enter");
  const pieces = (await inspect(page)).document.bodies;
  assert.equal(pieces.length, 2);
  for (const body of pieces) near(body.volume, 360);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, imprinted);
  await chooseTool(page, "redo", "redo");
}
async function route(page, name) {
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await reset(page);
  await chooseTool(page, "construction plane", "construction-plane");
  await pickPlane(page, "XY");
  await page.getByRole("button", { name: "Move plane Z", exact: true }).click();
  await page.getByRole("textbox", { name: "Plane translation Z", exact: true }).fill("12");
  await page.keyboard.press("Enter");
  const reference = (await inspect(page)).document.constructionPlanes;
  await page.keyboard.press("Enter");
  await page.keyboard.press("r");
  await drag(page, [0, 0], [6, 6], ["Alt"]);
  await chooseTool(page, "transform", "transform");
  await page.locator(".transform-box-handle:not([hidden])").first().click();
  await page.getByRole("checkbox", { name: "Uniform scale", exact: true }).check();
  await page.getByRole("textbox", { name: "Transform scale X" }).fill("2");
  await inspect(page);
  await page.getByRole("button", { name: "Accept transform scale" }).click();
  const scaledSketch = (await inspect(page)).document.sketches[0];
  const pick = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await page.getByRole("checkbox", { name: "Symmetric extrusion" }).check();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  const preview = await inspect(page);
  assert.ok(preview.preview?.bodies?.length, JSON.stringify(preview));
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  const extruded = (await inspect(page)).document;
  assert.deepEqual(extruded.constructionPlanes, reference);
  assert.deepEqual(extruded.sketches[0], scaledSketch);
  near(extruded.bodies[0].volume, 5760);
  near(extruded.bodies[0].bounds[2], 7);
  near(extruded.bodies[0].bounds[5], 17);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await page.locator(".transform-box-handle:not([hidden])").first().click();
  await page.getByRole("checkbox", { name: "Uniform scale", exact: true }).check();
  await page.getByRole("textbox", { name: "Transform scale X" }).fill("0.5");
  await inspect(page);
  await page.getByRole("button", { name: "Accept transform scale" }).click();
  const scaledBody = (await inspect(page)).document;
  near(scaledBody.bodies[0].volume, 720);
  for (const [i, value] of [-6, -6, 7, 6, 6, 12].entries())
    near(scaledBody.bodies[0].bounds[i], value);
  assert.deepEqual(scaledBody.constructionPlanes, reference);
  await chooseTool(page, "undo", "undo");
  near((await inspect(page)).document.bodies[0].volume, 5760);
  await chooseTool(page, "redo", "redo");
  near((await inspect(page)).document.bodies[0].volume, 720);
  await cut(page);
  const path = resolve(`.cache/sketch-review/${name}-composition.freac`);
  await saveDocument(page, path);
  await openDocument(page, path);
  const reopened = (await inspect(page)).document;
  assert.deepEqual(reopened.constructionPlanes, reference);
  assert.equal(reopened.bodies.length, 2);
  for (const body of reopened.bodies) near(body.volume, 360);
  await page.screenshot({ path: `.cache/sketch-review/${name}-composition.png` });
  assert.deepEqual(errors, []);
  console.log(
    `${name}: construction plane, centered drawing, Scale, symmetric Extrude, Imprint and Split compose`,
  );
}

await withUiRuntimes(route, { timeout: 20000 });
