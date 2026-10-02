import { drag, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function lines(page, pairs) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  for (const [a, b] of pairs) {
    await page.keyboard.press("l");
    await drag(page, a, b, ["Shift"]);
  }
  await page.keyboard.press("t");
}
export async function diameter(page, value) {
  const held = await page.locator(".trim-brush-controls").isVisible();
  if (!held) await page.keyboard.down("Alt");
  await page.getByRole("spinbutton", { name: "Brush diameter", exact: true }).fill(String(value));
  await page.keyboard.press("Enter");
  if (!held) await page.keyboard.up("Alt");
}
export const highlights = (page) => page.locator('.trim-span:not([points=""])');

export async function movePointer(page, p) {
  const delivered = page.evaluate(
    () =>
      new Promise((resolve) => {
        document
          .querySelector("canvas")
          .addEventListener(
            "pointermove",
            (event) => resolve({ x: event.clientX, y: event.clientY }),
            { once: true },
          );
      }),
  );
  await page.mouse.move(p.x, p.y);
  return delivered;
}
