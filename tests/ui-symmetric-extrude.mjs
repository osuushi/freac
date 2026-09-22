import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { at, close, drag, inspect, reset, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function symmetricExtrudeRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  await drag(page, [-10, -6], [10, 6]);
  const pick = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  const handle = page.getByRole("button", { name: "Drag extrusion", exact: true });
  const box = await handle.boundingBox();
  assert.ok(box);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 60, { steps: 4 });
  await settled(page);
  const ordinary = Number(
    await page.getByLabel("Extrusion distance", { exact: true }).inputValue(),
  );
  assert.ok(ordinary > 0);
  await page.keyboard.down("Alt");
  await settled(page);
  assert.equal(await page.getByLabel("Symmetric extrusion").isChecked(), true);
  let state = await inspect(page),
    body = state.preview.bodies[0];
  close(body.bounds[2], -ordinary);
  close(body.bounds[5], ordinary);
  await page.keyboard.up("Alt");
  await settled(page);
  assert.equal(await page.getByLabel("Symmetric extrusion").isChecked(), false);
  close((await inspect(page)).preview.bodies[0].bounds[2], 0);
  await page.keyboard.down("Alt");
  await page.mouse.up();
  await page.keyboard.up("Alt");
  state = await inspect(page);
  assert.equal(state.document.bodies?.length ?? 0, 0, "Release retains a temporary extrusion");
  assert.equal(await page.getByLabel("Symmetric extrusion").isChecked(), true);
  const input = page.getByLabel("Extrusion distance", { exact: true });
  await input.fill("-12");
  await settled(page);
  body = (await inspect(page)).preview.bodies[0];
  close(body.bounds[2], -6);
  close(body.bounds[5], 6);
  close(body.volume, 2880);
  await page.getByLabel("Draft measurement").selectOption("offset");
  await page.getByLabel("Draft value").fill("2");
  await settled(page);
  close((await inspect(page)).preview.bodies[0].volume, 12 * (240 + 64 + 16 / 3));
  await page.getByLabel("Draft measurement").selectOption("angle");
  await settled(page);
  assert.ok(Math.abs(Number(await page.getByLabel("Draft value").inputValue()) - 18.43) < 0.01);
  await page.getByLabel("Draft measurement").selectOption("offset");
  await settled(page);
  close(Number(await page.getByLabel("Draft value").inputValue()), 2);
  await page.getByLabel("Extrusion twist", { exact: true }).fill("60");
  await settled(page);
  body = (await inspect(page)).preview.bodies[0];
  close(body.bounds[2], -6);
  close(body.bounds[5], 6);
  await page.getByLabel("Draft value").fill("-7");
  await settled(page);
  assert.equal(
    await page.getByRole("button", { name: "Accept extrusion", exact: true }).isDisabled(),
    true,
  );
  await page.getByLabel("Draft value").fill("1");
  await settled(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-symmetric-extrude.png` });
  await acceptAndArchive(page, name);
  await checkboxAndCancel(page);
  console.log(
    `${name}: symmetric Extrude live Option, retained preview, signed total depth, draft/twist, recovery, history and archive passed`,
  );
}

async function checkboxAndCancel(page) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  await drag(page, [-10, -6], [10, 6]);
  const pick = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await page.getByLabel("Symmetric extrusion").check();
  await page.getByLabel("Extrusion distance", { exact: true }).fill("10");
  await settled(page);
  close((await inspect(page)).preview.bodies[0].bounds[2], -5);
  await page.keyboard.press("Escape");
  await settled(page);
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  assert.equal((await inspect(page)).preview, null);
}

async function acceptAndArchive(page, name) {
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  const accepted = (await inspect(page)).document;
  assert.equal(accepted.bodies.length, 1);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  const path = resolve(`.cache/sketch-review/${name}-symmetric-extrude.freac`);
  await saveDocument(page, path);
  await reset(page);
  await openDocument(page, path);
  close((await inspect(page)).document.bodies[0].volume, accepted.bodies[0].volume);
  await orient(page, [0, 0, 1]);
  const cap = await project(page, [0, 0, 6]);
  await page.mouse.click(cap.x, cap.y);
  await page.keyboard.press("e");
  await page.getByLabel("Extrusion distance", { exact: true }).fill("2");
  await settled(page);
  assert.ok((await inspect(page)).preview?.bodies?.length);
  await page.getByRole("button", { name: "Cancel extrusion", exact: true }).click();
  close((await inspect(page)).document.bodies[0].volume, accepted.bodies[0].volume);
}
