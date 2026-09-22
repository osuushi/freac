import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function hiddenSelectionRoute(page) {
  await reset(page);
  const button = (name) => page.getByRole("button", { name, exact: true });
  await button("Sketch on XY").click();
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  assert.equal((await inspect(page)).document.sketches.length, 1);
  const center = await at(page, 5, -3);
  await button("Modeling").click();
  await inspect(page);
  await page.mouse.click(center.x, center.y);

  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  const original = (await inspect(page)).document;
  for (const [label, kind, hide, key] of [
    ["Sketch 1", "sketch", null, "Backspace"],
    ["Body 1", "body", "Hide Body 1", "Delete"],
    ["Body 1", "body", "Hide bodies", "Backspace"],
  ]) {
    if (hide) await button(hide).click();
    await button(`Select ${label}`).click();
    assert.equal((await inspect(page)).modelingSelection[0].kind, kind);
    assert.equal(await button(`Select ${label}`).getAttribute("aria-pressed"), "true");
    assert.equal(await button(hide === "Hide bodies" ? "Show bodies" : `Show ${label}`).count(), 1);
    await page.keyboard.press(key);
    const deleted = (await inspect(page)).document;
    assert.equal(kind === "body" ? deleted.bodies.length : deleted.sketches.length, 0);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
    if (hide === "Hide Body 1") await button("Show Body 1").click();
  }
  console.log(`${name}: hidden sketch/body selection, deletion and Undo passed`);
}

await mkdir(".cache/sketch-review", { recursive: true });
const name = process.env.FREAC_TEST_BROWSER ?? "chromium";
let server, browser, app, page;
try {
  if (name === "electron") {
    app = await launchElectron({ args: ["."], env: { ...process.env, FREAC_TEST_HIDDEN: "1" } });
    page = await app.firstWindow();
    assert.equal(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
      false,
    );
  } else {
    server = await createServer({ server: { port: 0, watch: null, hmr: false } });
    await server.listen();
    browser = await { chromium, webkit }[name].launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    await page.goto(server.resolvedUrls.local[0]);
  }
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => {
    throw error;
  });
  await hiddenSelectionRoute(page);
} catch (error) {
  await page?.screenshot({
    path: `.cache/sketch-review/${name}-hidden-entity-selection-failure.png`,
  });
  console.log(
    await page?.evaluate(() => ({
      selection: window.freacInspect().modelingSelection,
      notice: document.querySelector("[role=status]")?.textContent,
    })),
  );
  throw error;
} finally {
  await browser?.close();
  await app?.close();
  await server?.close();
}
