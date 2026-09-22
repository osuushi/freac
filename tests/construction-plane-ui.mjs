import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron, openDocument, saveDocument } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { drag, inspect, reset, settled } from "./ui-helpers.mjs";
import { planeCutRoute } from "./ui-plane-cuts.mjs";
import { planeFaceReferenceRoute } from "./ui-plane-face-reference.mjs";
import { planePlacementRoute } from "./ui-plane-placement.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function movePlane(page, axis, value) {
  await orient(page, [1, 1, 1]);
  await page.getByRole("button", { name: `Move plane ${axis}`, exact: true }).click();
  await page.getByRole("textbox", { name: `Plane translation ${axis}`, exact: true }).fill(value);
}

const server = await createServer({ server: { port: 0 } });
await server.listen();
async function route(page, name) {
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await reset(page);
  await chooseTool(page, "construction plane", "construction-plane");
  await page.getByRole("button", { name: "Use plane XY", exact: true }).click();
  await movePlane(page, "Z", "12");
  assert.equal((await inspect(page)).document.constructionPlanes, undefined);
  await page.keyboard.press("Enter");
  let s = await inspect(page);
  assert.deepEqual(s.document.constructionPlanes[0].frame.origin, [0, 0, 12]);
  await page.getByRole("button", { name: "Move plane", exact: true }).click();
  await page.getByRole("button", { name: "Move plane X", exact: true }).click();
  await page.getByRole("textbox", { name: "Plane translation X", exact: true }).fill("7");
  await page.keyboard.press("Enter");
  await settled(page);
  s = await inspect(page);
  assert.deepEqual(s.document.constructionPlanes[0].frame.origin, [7, 0, 12]);
  await page.getByRole("button", { name: "Sketch on plane", exact: true }).click();
  await chooseTool(page, "rectangle", "rectangle");
  await drag(page, [0, 0], [10, 10]);
  s = await inspect(page);
  assert.equal(s.document.sketches.length, 1);
  assert.deepEqual(s.document.sketches[0].plane.origin, [7, 0, 12]);
  await chooseTool(page, "return to modeling", "modeling");
  await settled(page);
  await page.getByRole("button", { name: "Select Plane 1", exact: true }).first().click();
  await page.getByRole("button", { name: "Move plane", exact: true }).click();
  await movePlane(page, "Z", "3");
  await page.keyboard.press("Enter");
  s = await inspect(page);
  assert.deepEqual(s.document.sketches[0].plane.origin, [7, 0, 12]);
  assert.deepEqual(s.document.constructionPlanes[0].frame.origin, [7, 0, 15]);
  await page.getByRole("button", { name: "Hide Plane 1", exact: true }).click();
  assert.equal(await page.locator(".construction-plane-labels button").count(), 0);
  await page.getByRole("button", { name: "Show Plane 1", exact: true }).click();
  await page.getByRole("button", { name: "Select Plane 1", exact: true }).first().click();
  await page.getByRole("button", { name: "Delete plane", exact: true }).click();
  s = await inspect(page);
  assert.equal(s.document.constructionPlanes.length, 0);
  assert.equal(s.document.sketches.length, 1);
  await chooseTool(page, "undo", "undo");
  await settled(page);
  assert.equal((await inspect(page)).document.constructionPlanes.length, 1);
  await page.getByRole("button", { name: "Select Plane 1", exact: true }).first().click();
  await page.getByRole("button", { name: "Move plane", exact: true }).click();
  await movePlane(page, "Z", "8");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document.constructionPlanes[0].frame.origin, [7, 0, 15]);
  const saved = (await inspect(page)).document;
  const path = resolve(`.cache/plane-probe/${name}-plane.freac`);
  await saveDocument(page, path);
  await openDocument(page, path);
  await settled(page);
  assert.deepEqual((await inspect(page)).document, { ...saved, bodies: saved.bodies ?? [] });
  await planePlacementRoute(page);
  await page
    .locator(".entity-viewer")
    .getByRole("button", { name: "Select Plane 1", exact: true })
    .click();
  await page.keyboard.press("Enter");
  assert.ok((await inspect(page)).activePlane);
  await chooseTool(page, "return to modeling", "modeling");
  await page.screenshot({ path: `.cache/plane-probe/${name}-planes.png` });
  assert.deepEqual(errors, []);
  console.log(name, "plane lifecycle passed");
}
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.FREAC_TEST_BROWSER && process.env.FREAC_TEST_BROWSER !== name) continue;
    const browser = await engine.launch({ headless: true });
    try {
      const p = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      await p.goto(server.resolvedUrls.local[0]);
      await route(p, name);
      await planeCutRoute(p, name);
      await planeFaceReferenceRoute(p, name);
    } finally {
      await browser.close();
    }
  }
  if (!process.env.FREAC_TEST_BROWSER || process.env.FREAC_TEST_BROWSER === "electron") {
    const app = await launchElectron({
      args: ["."],
      env: { ...process.env, FREAC_TEST_HIDDEN: "1", FREAC_DEV_URL: server.resolvedUrls.local[0] },
    });
    try {
      const p = await app.firstWindow();
      assert.equal(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
        false,
      );
      await route(p, "electron");
      await planeCutRoute(p, "electron");
      await planeFaceReferenceRoute(p, "electron");
    } finally {
      await app.close();
    }
  }
} finally {
  await server.close();
}
