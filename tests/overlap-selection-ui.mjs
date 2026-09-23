import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { prism } from "../.cache/sketch-tests/tests/body-edge-fixtures.js";
import { launchElectron, openDocument } from "./native-documents.mjs";
import { project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { overlapCancellation } from "./ui-overlap-cancel.mjs";
import { overlapEdges } from "./ui-overlap-edges.mjs";
import { overlapTouch } from "./ui-overlap-touch.mjs";
import { chooseTool } from "./ui-tools.mjs";

const owner = new DocumentOwner();
let fixture;
try {
  await prism(owner, [
    [-30, -30],
    [30, -30],
    [30, 30],
    [-30, 30],
  ]);
  fixture = JSON.parse(JSON.stringify({ ...owner.view.data, sketches: [] }));
} finally {
  owner.close();
}
async function route(page, name) {
  await inspect(page);
  await openDocument(page, {
    name: "overlap.freac",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "freac", version: 1, document: fixture })),
  });
  const original = (await inspect(page)).document;
  assert.equal(await page.locator(".plane-label, .construction-plane-labels").count(), 0);
  const point = await project(page, [0, 0, 10]);
  await page.mouse.click(point.x, point.y);
  let state = await inspect(page);
  assert.deepEqual(state.planeTargets.find((p) => p.id === "XY").bounds, {
    minX: -42,
    maxX: 42,
    minY: -42,
    maxY: 42,
  });
  assert.equal(state.activePlane, null);
  assert.equal(state.modelingSelection[0]?.kind, "face", "Body geometry wins ordinary clicks");
  await overlapCancellation(page, point, hold);
  await overlapEdges(page, hold);
  await hold(page, point);
  const panel = page.getByRole("dialog", { name: "Choose overlapping geometry" });
  await panel.waitFor({ state: "visible" });
  const items = panel.locator(".selection-overlap-items button");
  const rows = await items.evaluateAll((items) =>
    items.map((b) => ({
      kind: b.dataset.kind,
      key: b.dataset.key,
      depth: Number(b.dataset.depth),
    })),
  );
  assert.equal(rows.filter((r) => r.kind === "face").length, 1, "Back face not listed");
  assert.ok(rows.some((r) => r.kind === "body"));
  assert.ok(rows.some((r) => r.kind === "plane"));
  assert.deepEqual(
    rows.map((r) => r.depth),
    rows.map((r) => r.depth).sort((a, b) => a - b),
  );
  assert.equal(await items.locator("svg path").count(), rows.length * 4);
  const plane = items.filter({ hasText: "Plane · XY" });
  await plane.hover();
  assert.equal(await panel.getAttribute("data-highlight"), "XY");
  await page.screenshot({ path: `.cache/sketch-review/${name}-overlap-plane.png` });
  await page.keyboard.press("Escape");
  assert.equal(await panel.isVisible(), false);
  assert.deepEqual((await inspect(page)).document, original);
  await hold(page, point);
  await panel.getByRole("button", { name: "Body", exact: true }).click();
  state = await inspect(page);
  assert.equal(state.modelingSelection[0].kind, "body");
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("3");
  await page.keyboard.press("Enter");
  assert.ok(Math.abs((await inspect(page)).document.bodies[0].center[0] - 3) < 1e-6);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await page.keyboard.press("Escape");

  await hold(page, await project(page, [-15, -15, 10]));
  await panel.getByRole("button", { name: "Plane · XY", exact: true }).click();
  assert.equal((await inspect(page)).activePlane, "XY");
  await chooseTool(page, "return to modeling", "modeling");
  await inspect(page);
  const p = await project(page, [0, 0, 10]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 35, p.y + 35, { steps: 5 });
  await page.waitForTimeout(700);
  await page.mouse.up();
  assert.equal(await panel.isVisible(), false, "Movement remains a normal drag");
  await hold(page, p);
  await page.mouse.wheel(0, 30);
  assert.equal(await panel.isVisible(), false, "Navigation dismisses chooser");
  await adaptiveMargin(page);
  console.log(
    `${name}: ordinary precedence, long hold, thumbnails, hover, body/plane choice and cancellation passed`,
  );
}
async function adaptiveMargin(page) {
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "return to modeling", "modeling");
  const margin = await project(page, [38, 4, 0]);
  await page.mouse.click(margin.x, margin.y);
  assert.equal(
    (await inspect(page)).activePlane,
    "XY",
    "Adaptive margin remains clickable outside a body larger than the old patch",
  );
  await chooseTool(page, "return to modeling", "modeling");
}
async function hold(page, p) {
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(720);
  await page.mouse.up();
}
await mkdir(".cache/sketch-review", { recursive: true });
const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  const engines =
    process.env.FREAC_TEST_BROWSER === "electron" ? { electron: null } : { chromium, webkit };
  for (const [name, engine] of Object.entries(engines)) {
    const browser = engine ? await engine.launch({ headless: true }) : null;
    const app = engine
      ? null
      : await launchElectron({
          args: [process.cwd()],
          env: {
            ...process.env,
            FREAC_TEST_HIDDEN: "1",
            FREAC_DEV_URL: server.resolvedUrls.local[0],
          },
        });
    try {
      const page = app
        ? await app.firstWindow()
        : await browser.newPage({ viewport: { width: 1280, height: 900 } });
      page.setDefaultTimeout(12000);
      if (!app) await page.goto(server.resolvedUrls.local[0]);
      await route(page, name);
      if (browser) {
        const touch = await browser.newPage({
          viewport: { width: 1280, height: 900 },
          hasTouch: true,
        });
        await touch.addInitScript(() => {
          window.freacRemote = true;
        });
        await touch.goto(server.resolvedUrls.local[0]);
        await inspect(touch);
        await overlapTouch(touch, name);
        await touch.close();
      }
    } finally {
      await browser?.close();
      await app?.close();
    }
  }
} finally {
  await server.close();
}
