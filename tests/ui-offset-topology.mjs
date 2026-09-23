import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { exportDocument, openDocument } from "./native-documents.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { click, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function load(page, name, plane) {
  const fixture = JSON.parse(await readFile(`tests/fixtures/${name}.json`, "utf8"));
  await reset(page);
  await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
  await inspect(page);
  await chooseTool(page, "return to modeling", "modeling");
  await openDocument(page, {
    name: `${name}.freac`,
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "freac", version: 1, document: fixture.document }),
    ),
  });
  await page.waitForFunction(
    (id) =>
      window.freacInspect().document.bodies?.[0]?.id === id ||
      window.freacInspect().document.sketches?.[0]?.id === id,
    fixture.document.bodies?.[0]?.id ?? fixture.document.sketches[0].id,
  );
  await inspect(page);
  return fixture;
}
async function undoRedo(page, before, after) {
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
}
export async function offsetTopologyRoute(page, name) {
  const cup = await load(page, "offset-cup-floor", "XY");
  await page.getByRole("button", { name: "Hide Sketch 1", exact: true }).click();
  await worldClick(page, [0, 15, 0]);
  assert.equal((await inspect(page)).modelingSelection[0]?.face, cup.selection[0].face);
  const before = (await inspect(page)).document;
  await chooseTool(page, "offset faces", "offset");
  const input = page.getByRole("textbox", { name: "Face offset distance", exact: true });
  await input.fill("5");
  const state = await inspect(page);
  assert.deepEqual(state.document, before);
  assert.ok(
    Math.abs(state.preview.bodies[0].volume - before.bodies[0].volume - Math.PI * 28 ** 2 * 5) <
      1e-5,
  );
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "offset faces", "offset");
  await input.fill("5");
  await inspect(page);
  await page.keyboard.press("Enter");
  const after = (await inspect(page)).document;
  await undoRedo(page, before, after);
  await worldClick(page, [0, 15, 5]);
  await chooseTool(page, "offset faces", "offset");
  await input.fill("1");
  await inspect(page);
  await page.keyboard.press("Enter");
  assert.ok(
    Math.abs(
      (await inspect(page)).document.bodies[0].volume -
        before.bodies[0].volume -
        Math.PI * 28 ** 2 * 6,
    ) < 1e-5,
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-offset-cup-floor.png` });
  await splitRoute(page, name);
  await shellRoute(page, name);
  console.log(
    `${name}: captured face lift, split offset, inward/outward Shell, history and later editing passed`,
  );
}
async function splitRoute(page, name) {
  const fixture = await load(page, "offset-split-arcs", "XZ");
  await chooseTool(page, "Sketch on XZ", "sketch-xz");
  await inspect(page);
  const before = (await inspect(page)).document;
  await page.keyboard.press("Meta+a");
  await chooseTool(page, "offset sketch curves", "sketch-offset");
  const offset = page.getByRole("textbox", { name: "Offset distance", exact: true });
  await offset.fill("-2");
  const islands = (await inspect(page)).preview.sketches[0].curves.slice(4);
  assert.ok(islands.every((curve) => curve.kind === "circle"));
  const radii = islands.map((curve) => curve.radius).sort((a, b) => a - b);
  assert.equal(radii.length, 3);
  for (const [i, radius] of [1, 4, 10].entries()) assert.ok(Math.abs(radii[i] - radius) < 1e-6);
  await offset.fill("-1");
  await page.keyboard.press("Enter");
  const after = (await inspect(page)).document;
  assert.equal(after.sketches[0].curves.length, 7);
  assert.equal((await inspect(page)).selection.length, 3);
  await undoRedo(page, before, after);
  await page.keyboard.press("v");
  await click(page, 10.875, 1.653594569415369);
  await drag(page, [10.875, 1.653594569415369], [10, 2.5], ["Shift"]);
  const edited = (await inspect(page)).document;
  assert.deepEqual(edited.sketches[0].curves.slice(0, 4), fixture.document.sketches[0].curves);
  assert.notDeepEqual(edited.sketches[0].curves.slice(4), after.sketches[0].curves.slice(4));
  await page.screenshot({ path: `.cache/sketch-review/${name}-split-offset.png` });
}
async function shellRoute(page, name) {
  const fixture = await load(page, "shell-notched-cylinder", "XZ");
  for (let i = 1; i <= fixture.document.sketches.length; i++)
    await page.getByRole("button", { name: `Hide Sketch ${i}`, exact: true }).click();
  const box = await page.locator("canvas").boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  // Turn the ordinary orbit control through 180 degrees to face the open cap.
  await page.mouse.move(x, y);
  await page.keyboard.down("Meta");
  await page.mouse.down();
  await page.mouse.move(x + Math.min(box.width, box.height) / 2, y, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await inspect(page);
  await worldClick(page, [8, 0, 4]);
  assert.equal((await inspect(page)).modelingSelection[0]?.face, fixture.selection[0].faces[0]);
  const before = (await inspect(page)).document;
  await page.keyboard.press("s");
  const field = page.getByRole("textbox", { name: "Shell thickness", exact: true });
  for (const thickness of [-2, 2]) {
    await field.fill(String(thickness));
    const state = await inspect(page);
    assert.ok(state.preview?.bodies[0].volume > 0, state.error);
    assert.deepEqual(state.document, before);
  }
  await page.keyboard.press("Enter");
  const after = (await inspect(page)).document;
  await undoRedo(page, before, after);
  await page.screenshot({ path: `.cache/sketch-review/${name}-notched-shell.png` });
  for (const format of ["stl", "3mf"])
    await exportDocument(
      page,
      format,
      resolve(`.cache/sketch-review/${name}-notched-shell.${format}`),
    );
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("5");
  await page.keyboard.press("Enter");
  const moved = (await inspect(page)).document.bodies[0];
  assert.ok(Math.abs(moved.center[0] - after.bodies[0].center[0] - 5) < 1e-6);
  assert.ok(Math.abs(moved.volume - after.bodies[0].volume) < 1e-5);
  await bodyArchiveRoute(page, `${name}-offset-topology`);
}
