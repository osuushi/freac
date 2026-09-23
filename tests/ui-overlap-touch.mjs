import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";

/** Real Chromium touch delivery, WebKit PointerEvent adapter coverage. No hardware claim. */
export async function overlapTouch(page, name) {
  const point = await project(page, [0, 0, 10]);
  const before = await inspect(page);
  const cdp = name === "chromium" ? await page.context().newCDPSession(page) : null;
  let last = point;
  async function touch(type, points) {
    if (points.length) last = { x: points[0][1], y: points[0][2] };
    if (cdp)
      return cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 1, radiusY: 1, force: 1 })),
      });
    return page.evaluate(
      ({ type, points, p }) => {
        const down = type === "touchStart",
          up = type === "touchEnd",
          cancel = type === "touchCancel";
        const q = points[0] ?? [1, p.x, p.y];
        document.querySelector("canvas").dispatchEvent(
          new PointerEvent(
            down ? "pointerdown" : cancel ? "pointercancel" : up ? "pointerup" : "pointermove",
            {
              bubbles: true,
              cancelable: true,
              pointerType: "touch",
              pointerId: q[0],
              isPrimary: true,
              clientX: q[1],
              clientY: q[2],
              button: 0,
              buttons: up ? 0 : 1,
            },
          ),
        );
      },
      { type, points, p: last },
    );
  }
  if (!cdp)
    await page.evaluate(() => {
      const canvas = document.querySelector("canvas"),
        capture = canvas.setPointerCapture.bind(canvas);
      canvas.setPointerCapture = (id) => {
        try {
          capture(id);
        } catch (error) {
          if (error.name !== "NotFoundError") throw error;
        }
      };
    });
  try {
    await touch("touchStart", [[1, point.x, point.y]]);
    await page.waitForTimeout(720);
    const panel = page.getByRole("dialog", { name: "Choose overlapping geometry" });
    await panel.waitFor({ state: "visible" });
    assert.deepEqual((await inspect(page)).camera, before.camera, "Stationary hold does not orbit");
    const item = await panel.getByRole("button", { name: "Body", exact: true }).boundingBox();
    await touch("touchMove", [[1, item.x + item.width / 2, item.y + item.height / 2]]);
    assert.ok(
      await panel.getAttribute("data-highlight"),
      "Captured touch highlights the item under the finger",
    );
    await touch("touchEnd", []);
    assert.equal(await panel.isVisible(), false, "Release completes the continuous gesture");
    assert.equal(
      (await inspect(page)).modelingSelection[0]?.kind,
      "body",
      "Touch release selects without another tap",
    );
    assert.deepEqual((await inspect(page)).document, before.document);
    await page.keyboard.press("Escape");
    const p = await project(page, [-15, -15, 10]);
    const selection = (await inspect(page)).modelingSelection;
    await touch("touchStart", [[1, p.x, p.y]]);
    await page.waitForTimeout(720);
    await panel.waitFor({ state: "visible" });
    await touch("touchCancel", []);
    assert.equal(await panel.isVisible(), false, "Canceled contact does not choose");
    assert.deepEqual((await inspect(page)).modelingSelection, selection);
    await touch("touchStart", [[1, p.x, p.y]]);
    await touch("touchMove", [[1, p.x + 45, p.y + 30]]);
    await page.waitForTimeout(720);
    await touch("touchEnd", []);
    assert.equal(await panel.isVisible(), false, "Touch movement cancels hold and orbits");
    assert.notDeepEqual((await inspect(page)).camera.position, before.camera.position);
    console.log(name, "touch hold-drag-release and orbit cancellation passed");
  } finally {
    await cdp?.detach();
  }
}
