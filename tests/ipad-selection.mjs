import assert from "node:assert/strict";
import { penDriver } from "./ipad-pen.mjs";
import { inspect, settled } from "./ui-helpers.mjs";

export async function tabletBodySelection(page, name, edge, center) {
  const cdp = name === "chromium" ? await page.context().newCDPSession(page) : null;
  const pen = await penDriver(page, cdp);
  const original = (await inspect(page)).document;
  const body = original.bodies[0].id;
  const tap = async (point) => {
    await pen.down(point);
    const lift = { x: point.x + 10, y: point.y + 8 };
    await pen.move(lift);
    await pen.up(lift);
  };
  try {
    await page.keyboard.press("Escape");
    await tap(edge);
    let state = await inspect(page);
    assert.equal(
      state.modelingSelection[0]?.kind,
      "edge",
      "Tip drift retains the initial edge pick",
    );
    assert.deepEqual(state.document, original);
    assert.equal(state.preview, null);
    for (const point of [{ x: center.x - 55, y: center.y - 55 }, center]) {
      await page.keyboard.press("Escape");
      await tap(point);
      state = await inspect(page);
      assert.equal(state.modelingSelection[0]?.kind, "face");
      const second = { x: point.x + 6, y: point.y - 4 };
      // Separate contacts with drift; deliberately no native dblclick command.
      await tap(second);
      state = await inspect(page);
      assert.deepEqual(state.modelingSelection, [{ kind: "body", body }]);
      assert.deepEqual(state.document, original);
      assert.equal(state.preview, null);
    }
    await widgetDoubleTap(page, tap, center, body, original);
    // A large Pencil sweep must still perform marquee selection.
    await page.keyboard.press("Escape");
    const a = { x: edge.x - 35, y: center.y - 140 };
    const b = { x: center.x + 140, y: center.y + 140 };
    await pen.down(a);
    await pen.move(b);
    await pen.up(b);
    await settled(page);
    assert.ok((await inspect(page)).modelingSelection.length);
    assert.deepEqual((await inspect(page)).document, original);
    await page.keyboard.press("Escape");
    console.log(
      name,
      "Pencil solid edge taps, drifted body double tap and deliberate marquee passed",
    );
  } finally {
    await cdp?.detach();
    if (!cdp)
      await page.evaluate(() => {
        window.testPen = false;
      });
  }
}

async function widgetDoubleTap(page, tap, center, body, original) {
  await page.keyboard.press("Escape");
  await tap(center);
  await settled(page);
  const bounds = await page
    .getByRole("button", { name: "Offset faces", exact: true })
    .boundingBox();
  assert.ok(bounds);
  const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.keyboard.press("Escape");
  await tap(point);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  const second = { x: point.x + 6, y: point.y - 4 };
  assert.ok(
    await page.evaluate(
      (p) => !!document.elementFromPoint(p.x, p.y)?.closest(".axial-arrow"),
      second,
    ),
    "The first face tap places a widget under the second tap",
  );
  await tap(second);
  const state = await inspect(page);
  assert.deepEqual(state.modelingSelection, [{ kind: "body", body }]);
  assert.deepEqual(state.document, original);
  assert.equal(state.preview, null);
}
