import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { bodyMultiselectRoute } from "./ui-body-multiselect.mjs";
import { inspect } from "./ui-helpers.mjs";
import { modelFrustumSelectionRoute } from "./ui-model-frustum-selection.mjs";

async function mouseSelection(page, name) {
  const { center, top } = await plate(page);
  const original = (await inspect(page)).document;
  for (const point of [center, { x: center.x - 60, y: center.y - 60 }, top]) {
    await page.keyboard.press("Escape");
    await page.mouse.dblclick(point.x, point.y);
    const state = await inspect(page);
    assert.deepEqual(state.modelingSelection, [{ kind: "body", body: original.bodies[0].id }]);
    assert.deepEqual(state.document, original);
    assert.equal(state.preview, null);
  }
  await page.mouse.click(center.x - 60, center.y - 60);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  await page.keyboard.press("Enter");
  assert.ok((await inspect(page)).activePlane);
  assert.deepEqual((await inspect(page)).document, original);
  await modelFrustumSelectionRoute(page, name);
  console.log(name, "mouse body double-click, face selection/entry and marquee passed");
}
const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  for (const name of ["chromium", "webkit", "electron"]) {
    let browser, app;
    try {
      let page;
      if (name === "electron") {
        app = await launchElectron({
          args: ["."],
          env: {
            ...process.env,
            FREAC_TEST_HIDDEN: "1",
            FREAC_DEV_URL: server.resolvedUrls.local[0],
          },
        });
        page = await app.firstWindow();
      } else {
        browser = await { chromium, webkit }[name].launch({ headless: true });
        page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
        await page.goto(server.resolvedUrls.local[0]);
      }
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await bodyMultiselectRoute(page, name);
      await mouseSelection(page, name);
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await app?.close();
    }
  }
} finally {
  await server.close();
}
