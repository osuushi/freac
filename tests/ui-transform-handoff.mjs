import assert from "node:assert/strict";
import { resolve } from "node:path";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function center(locator) {
  const bounds = await locator.boundingBox();
  assert.ok(bounds);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

async function pauseAcceptance(page) {
  await page.evaluate(() => {
    const original = window.fetch;
    let release;
    const waiting = new Promise((resolve) => {
      release = resolve;
    });
    window.handoffTest = { reached: false, release, pointerId: null };
    window.addEventListener(
      "pointermove",
      (event) => {
        window.handoffTest.pointerId = event.pointerId;
      },
      { capture: true },
    );
    window.fetch = async function (...args) {
      const response = await original.call(this, ...args);
      const request = args[1]?.body && JSON.parse(args[1].body);
      if (request?.kind === "accept") {
        window.handoffTest.reached = true;
        await waiting;
      }
      return response;
    };
  });
}

export async function transformHandoffRoute(page, name) {
  for (const target of ["anchor", "arrow", "box"]) {
    for (const interruption of ["blur", "pointercancel"]) {
      await reset(page);
      await chooseTool(page, "Sketch on XY", "sketch-xy");
      await page.keyboard.press("r");
      await drag(page, [0, 0], [20, 10]);
      const before = (await inspect(page)).document;
      await page.keyboard.press("m");
      await page.locator(".transform-box-handle:not([hidden])").first().click();
      await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("1.5");
      const scaled = (await inspect(page)).preview;
      assert.ok(scaled);
      const press =
        target === "box"
          ? await at(page, 7, 3)
          : await center(
              target === "anchor"
                ? page.getByRole("button", { name: "Reposition sketch pivot", exact: true })
                : page.locator('[data-move-marker="x"] > svg'),
            );
      await pauseAcceptance(page);
      try {
        if (target === "box") await page.keyboard.down("Meta");
        await page.mouse.move(press.x, press.y);
        await page.mouse.down();
        await page.waitForFunction(() => window.handoffTest.reached);
        await page.mouse.move(press.x + 30, press.y - 15);
        await page.evaluate((type) => {
          window.dispatchEvent(
            type === "blur"
              ? new Event("blur")
              : new PointerEvent("pointercancel", { pointerId: window.handoffTest.pointerId }),
          );
        }, interruption);
        await page.mouse.up();
        await page.evaluate(() => window.handoffTest.release());
        await page.waitForFunction(() => window.makeshiftInspect().interaction === null);
        const after = await inspect(page);
        assert.deepEqual(
          after.document,
          scaled,
          `${target}/${interruption} retains completed scale`,
        );
        assert.equal(after.preview, null, "aborted press cannot resume a transform");
        await chooseTool(page, "undo", "undo");
        const undone = await inspect(page);
        assert.deepEqual(undone.document, before, "scale has one Undo step");
      } finally {
        await page.evaluate(() => window.handoffTest?.release());
        await page.mouse.up();
        await page.keyboard.up("Meta");
      }
    }
  }
  await bufferedPointerChecks(page);
  console.log(
    `${name}: delayed real scale completion abandons cancelled anchor, arrow and box handoffs`,
  );
}

async function bufferedPointerChecks(page) {
  const result = await page.evaluate(
    async (path) => {
      const { BufferedPointer } = await import(path);
      const parent = new AbortController();
      const buffer = new BufferedPointer(
        new PointerEvent("pointerdown", {
          pointerId: 91,
          buttons: 1,
          clientX: 5,
          clientY: 10,
          shiftKey: true,
        }),
        parent.signal,
      );
      const initialShift = buffer.event("pointerdown").shiftKey;
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", altKey: true }));
      const modifiers = {
        shift: buffer.event("pointerdown").shiftKey,
        alt: buffer.event("pointerdown").altKey,
      };
      window.dispatchEvent(
        new PointerEvent("pointerup", { pointerId: 91, clientX: 15, clientY: 20 }),
      );
      window.dispatchEvent(
        new PointerEvent("pointermove", { pointerId: 91, clientX: 100, clientY: 100 }),
      );
      const position = buffer.position;
      parent.abort();
      return { initialShift, modifiers, position, released: buffer.released, valid: buffer.valid };
    },
    `/@fs/${resolve("src/model/buffered-pointer.ts")}`,
  );
  assert.deepEqual(result, {
    initialShift: true,
    modifiers: { shift: false, alt: true },
    position: { x: 15, y: 20 },
    released: true,
    valid: false,
  });
}
