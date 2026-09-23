import assert from "node:assert/strict";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function redrawRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-18, -18], [18, 18]);
  const pick = await at(page, 5, 3);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  const before = await inspect(page);
  assert.equal(before.document.bodies.length, 1);
  // A burst is deliberately synchronous to prove event coalescing independently
  // of operating-system wheel delivery. Real wheel/drag routes run alongside it.
  const updates = await page.evaluate(async () => {
    const target = document.querySelector(".origin");
    const observer = new MutationObserver(() => {});
    observer.observe(target, { attributes: true, attributeFilter: ["style"] });
    const canvas = document.querySelector("canvas");
    for (let i = 0; i < 20; i++)
      canvas.dispatchEvent(new WheelEvent("wheel", { deltaX: 1, cancelable: true }));
    const immediate = observer.takeRecords().length;
    let painted = 0;
    observer.disconnect();
    const frames = new MutationObserver(() => {
      painted += 1;
    });
    frames.observe(target, { attributes: true, attributeFilter: ["style"] });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    frames.disconnect();
    return { immediate, painted };
  });
  assert.deepEqual(updates, { immediate: 0, painted: 1 }, "Twenty inputs share one redraw");
  const after = await inspect(page);
  assert.notDeepEqual(after.camera.target, before.camera.target);
  assert.deepEqual(after.document, before.document);
  assert.equal(
    await page.locator(".plane-label").count(),
    0,
    "No floating labels intercept geometry",
  );
  await page.mouse.click(pick.x - 20, pick.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  console.log(
    `${name}: solid navigation batches 20 inputs into one paint; label-free face picking passes`,
  );
}
