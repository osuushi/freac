import assert from "node:assert/strict";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
export async function scaleWholeSketchRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [4, 4], [12, 8]);
  await chooseTool(page, "return to modeling", "modeling");
  await chooseTool(page, "Sketch on XZ", "sketch-xz");
  await page.keyboard.press("c");
  await drag(page, [-10, 6], [-6, 6]);
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await page
    .getByRole("button", { name: "Select Sketch 2", exact: true })
    .click({ modifiers: ["Shift"] });
  const before = (await inspect(page)).document;
  assert.equal((await inspect(page)).modelingSelection.length, 2);
  await chooseTool(page, "transform", "transform");
  await page.getByRole("checkbox", { name: "Uniform scale", exact: true }).check();
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("2");
  let state = await inspect(page);
  assert.deepEqual(state.document, before);
  assert.equal(state.preview.sketches.length, 2);
  for (let i = 0; i < 2; i++) {
    const a = before.sketches[i],
      b = state.preview.sketches[i];
    assert.deepEqual(b.plane.u, a.plane.u);
    assert.deepEqual(b.plane.v, a.plane.v);
    assert.equal(b.id, a.id);
    const old = a.curves[0],
      next = b.curves[0];
    if (old.kind === "circle") {
      close(next.radius, old.radius * 2);
      close(next.center.x, old.center.x * 2);
    } else {
      close(next.a.x, old.a.x * 2);
      close(next.b.y, old.b.y * 2);
    }
  }
  await page.getByRole("button", { name: "Accept transform scale", exact: true }).click();
  const accepted = (await inspect(page)).document;
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await page.getByRole("button", { name: "Select Sketch 2", exact: true }).click();
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.equal(state.activeSketch, accepted.sketches[1].id, "scaled sketch can be re-entered");
  console.log(
    `${name}: multiple whole sketch tokens scale planes/curves atomically and re-enter after history`,
  );
}
export async function scaleConstraintRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [8, 8], [14, 8]);
  await page.getByRole("button", { name: "Lock Radius", exact: true }).click();
  const before = (await inspect(page)).document;
  await chooseTool(page, "transform", "transform");
  await page.getByRole("checkbox", { name: "Uniform scale", exact: true }).check();
  const input = page.getByRole("textbox", { name: "Transform scale X", exact: true });
  await input.fill("");
  await input.pressSequentially("2", { delay: 40 });
  await inspect(page);
  await page.keyboard.press("Tab");
  assert.ok(
    await page
      .getByRole("textbox", { name: "Transform scale Y", exact: true })
      .evaluate((field) => field === document.activeElement),
  );
  await page.keyboard.press("Shift+Tab");
  assert.ok(await input.evaluate((field) => field === document.activeElement));
  assert.equal(await input.inputValue(), "2", "Ordinary typing reaches Scale's field");
  const state = await inspect(page);
  assert.deepEqual(state.document, before);
  assert.equal(state.preview, null);
  assert.ok(
    await page.getByRole("button", { name: "Accept transform scale", exact: true }).isDisabled(),
  );
  assert.match(await page.getByRole("status").textContent(), /Transform conflicts/);
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("1");
  await inspect(page);
  await page.getByRole("button", { name: "Cancel transform scale", exact: true }).click();
  await inspect(page);
  await chooseTool(page, "select", "select");
  await page.getByRole("button", { name: "Unlock Radius", exact: true }).click();
  await inspect(page);
  await chooseTool(page, "transform", "transform");
  await page.getByRole("checkbox", { name: "Uniform scale", exact: true }).check();
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("2");
  await inspect(page);
  await page.keyboard.press("Enter");
  close(
    (await inspect(page)).document.sketches[0].curves[0].radius,
    before.sketches[0].curves[0].radius * 2,
  );
  console.log(
    `${name}: exact radius-lock rejection, identity recovery, unlock and Scale acceptance`,
  );
}
