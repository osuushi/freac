import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(await readFile("tests/fixtures/shell-bent-sweep.json", "utf8"));
export async function shellSweepRoute(page, name) {
  await reset(page);
  await openDocument(page, {
    name: "bent-sweep.freac",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "freac", version: 1, document: fixture.document }),
    ),
  });
  await page.waitForFunction(() => window.freacInspect().document.bodies?.length === 1);
  await worldClick(page, [-20, 0, 0]);
  await page.keyboard.down("Shift");
  await worldClick(page, [20, 0, 0]);
  await page.keyboard.up("Shift");
  const initial = await inspect(page);
  assert.deepEqual(
    initial.modelingSelection.map((s) => s.face).sort(),
    [...fixture.operation.selection[0].faces].sort(),
  );
  await page.keyboard.press("s");
  const input = page.getByRole("textbox", { name: "Shell thickness", exact: true });
  for (const [thickness, volume] of [
    [-1, 2463.5761444],
    [1, 2792.0529636],
    [-2, 4598.6754695],
  ]) {
    await input.fill(String(thickness));
    const state = await inspect(page);
    assert.deepEqual(state.document, initial.document);
    assert.ok(Math.abs((state.preview?.bodies[0].volume ?? 0) - volume) < 1e-5, state.notice);
  }
  await input.fill("-8");
  assert.equal((await inspect(page)).preview, null);
  assert.equal(
    await page.getByRole("button", { name: "Accept shell", exact: true }).isEnabled(),
    false,
  );
  await input.fill("-1");
  await inspect(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-shell-sweep.png` });
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, initial.document);
  await page.keyboard.press("s");
  await input.fill("-1");
  await inspect(page);
  await page.keyboard.press("Enter");
  const accepted = (await inspect(page)).document;
  assert.ok(Math.abs(accepted.bodies[0].volume - 2463.5761444) < 1e-5);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, initial.document);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await bodyArchiveRoute(page, `${name}-shell-sweep`);
  // Reselect a retained outer wall, then move its owning body using ordinary controls.
  await worldClick(page, [-15, 5, 8]);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  await chooseTool(page, "select owning bodies", "selection-bodies");
  await page.keyboard.press("m");
  const handle = page.getByRole("button", { name: "Move body X", exact: true });
  await handle.click();
  const move = page.locator(".body-transform-value");
  await move.fill("2");
  await page.keyboard.press("Enter");
  const moved = (await inspect(page)).document.bodies[0];
  assert.ok(Math.abs(moved.center[0] - accepted.bodies[0].center[0] - 2) < 1e-6);
  assert.ok(Math.abs(moved.volume - accepted.bodies[0].volume) < 1e-6);
  console.log(
    `${name}: captured bent Shell ±1/-2, rejection/recovery, cancel, Undo/Redo, Save/Open, reselect and Move pass`,
  );
}
