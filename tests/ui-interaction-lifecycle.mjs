import assert from "node:assert/strict";
import { filletGuidePoint } from "./ui-fillet-guide-helpers.mjs";
import { at, click, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool, toolEnabled } from "./ui-tools.mjs";

export async function interactionLifecycleRoute(page, name) {
  for (const kind of ["pointer", "bow", "fillet", "offset"]) {
    await reset(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await page.keyboard.press("r");
    await drag(page, [-10, -5], [10, 5]);
    await page.keyboard.press("v");
    const original = (await inspect(page)).document;
    const edge = original.sketches[0].curves[0];
    if (kind === "bow") await click(page, edge.a.x + (edge.b.x - edge.a.x) * 0.25, edge.a.y);
    if (kind === "fillet") await click(page, edge.a.x, edge.a.y);
    const geometryHistory = async () =>
      (await page.evaluate(() => window.freacHistory()))
        .filter((entry) => entry.outcome === "changed" && entry.operation.kind !== "selection")
        .map((entry) => entry.id);
    const beforeHistory = await geometryHistory();
    for (const interruption of ["capture", "blur", "Escape"]) {
      const start = await startPoint(page, kind);
      const end = kind === "pointer" ? await at(page, 3, 1) : { x: start.x + 8, y: start.y - 8 };
      // Observe actual capture from the real pointer route, then simulate its loss.
      await page.evaluate(() => {
        document.addEventListener(
          "gotpointercapture",
          (e) => {
            window.testCapture = { element: e.target, id: e.pointerId };
          },
          { once: true },
        );
      });
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 3 });
      await page.waitForFunction((kind) => window.freacInspect().interaction?.kind === kind, kind);
      if (interruption === "capture") {
        await page.evaluate(() => {
          const c = window.testCapture;
          if (!c?.element.hasPointerCapture(c.id)) throw new Error("Real pointer capture missing");
          c.element.releasePointerCapture(c.id);
        });
        await page.mouse.move(end.x + 1, end.y);
      } else if (interruption === "blur") {
        await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      } else await page.keyboard.press("Escape");
      await page.mouse.up();
      await page.waitForFunction(() => window.freacInspect().interaction === null);
      const after = await inspect(page);
      assert.deepEqual(after.document, original, `${kind}: ${interruption} preserves geometry`);
      assert.equal(after.preview, null);
      assert.equal(await toolEnabled(page, "redo", "redo"), false);
      assert.deepEqual(
        await geometryHistory(),
        beforeHistory,
        "Cancelled edit adds no geometry Undo",
      );
    }
    await chooseTool(page, "circle", "circle");
    assert.equal((await inspect(page)).tool, "circle", "Tool change works after cleanup");
    for (let i = 0; i < 8 && (await inspect(page)).document.sketches.length; i++)
      await chooseTool(page, "undo", "undo");
    assert.equal((await inspect(page)).document.sketches.length, 0, "Cancelled edits add no Undo");
  }
  await numericOwnership(page);
  console.log(
    `${name}: pointer/bow/fillet/offset Escape, focus loss and lost capture; numeric ownership and Undo passed`,
  );
}

async function startPoint(page, kind) {
  if (kind === "pointer") return at(page, 0, 0);
  if (kind === "fillet") return filletGuidePoint(page);
  const box = await (kind === "bow"
    ? page.locator(".bow-handle").first()
    : page.getByRole("button", { name: "Offset loop", exact: true })
  ).boundingBox();
  assert.ok(box, `${kind} control visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function numericOwnership(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -5], [10, 5]);
  const original = (await inspect(page)).document;
  const corner = original.sketches[0].curves[0].a;
  const width = page.getByRole("textbox", { name: "Width", exact: true });
  await width.focus();
  await click(page, corner.x, corner.y);
  const clicked = await inspect(page);
  assert.ok(clicked.selectedPoint, "Unchanged field does not swallow the next point click");
  await click(page, 0, 0);
  await width.fill("28");
  assert.equal((await inspect(page)).interaction.kind, "numeric");
  await page.keyboard.press("Escape");
  assert.equal((await inspect(page)).interaction, null);
  assert.deepEqual((await inspect(page)).document, original);
  await width.fill("28");
  await page.keyboard.press("Tab");
  assert.equal((await inspect(page)).interaction.kind, "numeric", "Tab transfers field ownership");
  await page.keyboard.press("Escape");
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original, "Numeric acceptance has one Undo");
}
