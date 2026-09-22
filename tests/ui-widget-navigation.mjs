import assert from "node:assert/strict";
import { inspect } from "./ui-helpers.mjs";

export async function widgetNavigationRoute(page, name) {
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.keyboard.press("m");
  const original = (await inspect(page)).document;
  for (const label of ["Reposition body pivot", "Move body X", "Rotate body Z"]) {
    const widget = page.getByRole("button", { name: label, exact: true });
    await navigationOver(page, widget);
  }
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  const field = page.locator(".body-transform-value");
  await navigationOver(page, field);
  assert.equal(await field.inputValue(), "0", "Camera input must not change the numeric edit");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  await page.keyboard.press("Escape");
  console.log(
    `${name}: widget scroll-pan, Alt-scroll orbit, pinch, right/middle drag pass through without edits`,
  );
}

async function navigationOver(page, widget) {
  for (const kind of ["pan", "orbit", "pinch", "right", "middle"]) {
    await widget.hover();
    const before = (await inspect(page)).camera;
    if (kind === "right" || kind === "middle") {
      const box = await widget.boundingBox();
      await page.mouse.down({ button: kind });
      await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 10, { steps: 4 });
      await page.mouse.up({ button: kind });
    } else {
      const key = kind === "orbit" ? "Alt" : kind === "pinch" ? "Control" : null;
      if (key) await page.keyboard.down(key);
      await page.mouse.wheel(10, kind === "pinch" ? -4 : 10);
      if (key) await page.keyboard.up(key);
    }
    const property = kind === "orbit" ? "position" : kind === "pinch" ? "height" : "target";
    await page.waitForFunction(
      ({ property, previous }) =>
        JSON.stringify(window.freacInspect().camera[property]) !== JSON.stringify(previous),
      { property, previous: before[property] },
    );
  }
}
