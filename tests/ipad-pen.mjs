import { at, settled } from "./ui-helpers.mjs";

export async function penDriver(page, cdp) {
  if (!cdp)
    await page.evaluate(() => {
      window.testPen = true;
    });
  const send = async (type, point) => {
    if (cdp) {
      await cdp.send("Input.dispatchMouseEvent", {
        type,
        ...point,
        button: "left",
        buttons: type === "mouseReleased" ? 0 : 1,
        clickCount: type === "mouseMoved" ? 0 : 1,
        pointerType: "pen",
      });
    } else {
      await page.mouse.move(point.x, point.y);
      if (type === "mousePressed") await page.mouse.down();
      if (type === "mouseReleased") await page.mouse.up();
    }
  };
  const pen = async (a, b) => {
    const start = await at(page, ...a),
      end = await at(page, ...b);
    await send("mousePressed", start);
    for (let i = 1; i <= 10; i++)
      await send("mouseMoved", {
        x: start.x + ((end.x - start.x) * i) / 10,
        y: start.y + ((end.y - start.y) * i) / 10,
      });
    await send("mouseReleased", end);
    await settled(page);
  };
  pen.down = (point) => send("mousePressed", point);
  pen.move = (point) => send("mouseMoved", point);
  pen.up = (point) => send("mouseReleased", point);
  return pen;
}

// Classify before application capture listeners, including modeling double tap.
// WebKit automation still uses native mouse capture, not physical Pencil input.
export function installPenClassification(page) {
  return page.addInitScript(() => {
    for (const type of ["pointerdown", "pointermove", "pointerup"])
      window.addEventListener(
        type,
        (event) => {
          if (window.testPen && event.pointerType === "mouse")
            Object.defineProperty(event, "pointerType", { value: "pen" });
        },
        { capture: true },
      );
  });
}
