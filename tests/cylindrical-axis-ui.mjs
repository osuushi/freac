import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { cylindricalAxisFixture } from "../.cache/sketch-tests/tests/cylindrical-axis-fixture.js";
import { launchElectron, openDocument, saveDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect } from "./ui-helpers.mjs";
import { revolveRoute } from "./ui-revolve.mjs";
import { chooseTool } from "./ui-tools.mjs";

const guide = (page) => page.locator('.revolve-guides [data-kind="axis"]');
const wallPoint = [12 + Math.sqrt(8), -Math.sqrt(8), 7];
async function hover(page, point) {
  const p = await project(page, point);
  await page.mouse.move(p.x, p.y);
  await inspect(page);
}
async function verifyAxis(page) {
  assert.equal(await guide(page).count(), 1);
  const points = (await guide(page).getAttribute("points"))
    .split(" ")
    .map((p) => p.split(",").map(Number));
  const p = await project(page, [12, 0, 6]);
  const [[ax, ay], [bx, by]] = points;
  const distance =
    Math.abs((bx - ax) * (ay - p.y) - (ax - p.x) * (by - ay)) / Math.hypot(bx - ax, by - ay);
  assert.ok(distance < 0.01, `Hover guide must pass through cylinder center: ${distance}`);
}
async function route(page, name, partial) {
  const tag = `${name}-${partial ? "partial" : "full"}`;
  await inspect(page);
  await openDocument(page, resolve(`.cache/cylindrical-axis/${partial}.freac`));
  await orient(page, [1, -1, 1]);
  await worldClick(page, [19, 0, 3]);
  await chooseTool(page, "revolve", "revolve");
  const before = (await inspect(page)).document;
  await hover(page, wallPoint);
  await verifyAxis(page);
  assert.deepEqual((await inspect(page)).document, before);
  assert.equal((await inspect(page)).preview, null);
  await page.screenshot({ path: `.cache/cylindrical-axis/${tag}-hover.png` });
  await page.getByRole("button", { name: "Tools", exact: true }).hover();
  assert.equal(await guide(page).count(), 0, "Leaving canvas clears hover");
  await hover(page, [14, -1, 12]);
  assert.equal(await guide(page).count(), 0, "Planar cap is not a cylindrical axis");
  await worldClick(page, wallPoint);
  let state = await inspect(page);
  assert.equal(state.preview.bodies.length, 2);
  const added = state.preview.bodies.find((b) => b.id !== before.bodies[0].id);
  assert.ok(Math.abs(added.volume - 56 * Math.PI) < 1e-5);
  await page.getByRole("button", { name: "Change revolution axis", exact: true }).click();
  await hover(page, wallPoint);
  await verifyAxis(page);
  await worldClick(page, wallPoint);
  await page.getByRole("textbox", { name: "Revolution angle", exact: true }).fill("180");
  state = await inspect(page);
  assert.ok(
    Math.abs(state.preview.bodies.find((b) => b.id !== before.bodies[0].id).volume - 28 * Math.PI) <
      1e-5,
  );
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "revolve", "revolve");
  await worldClick(page, wallPoint);
  await inspect(page);
  await page.getByRole("button", { name: "Accept revolution", exact: true }).click();
  const after = (await inspect(page)).document;
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
  const saved = resolve(`.cache/cylindrical-axis/${tag}-result.freac`);
  await saveDocument(page, saved);
  await openDocument(page, saved);
  assert.equal((await inspect(page)).document.bodies.length, 2);
  await invalidAxis(page, before, partial);
  await visibilityChecks(page, partial);
  console.log(
    tag,
    "axis hover, picking, reselection, geometry, cancellation, history and archive passed",
  );
}
async function invalidAxis(page, before, partial) {
  await inspect(page);
  await openDocument(page, resolve(`.cache/cylindrical-axis/${partial}.freac`));
  await orient(page, [1, -1, 1]);
  await worldClick(page, [19, 3, 20]);
  await chooseTool(page, "revolve", "revolve");
  await hover(page, wallPoint);
  assert.equal(await guide(page).count(), 0, "Axis outside profile plane has no valid hover");
  await worldClick(page, wallPoint);
  const state = await inspect(page);
  assert.equal(state.preview, null);
  assert.match(await page.getByRole("status").textContent(), /axis in the profile plane/);
  assert.deepEqual(state.document, before);
  await page.keyboard.press("Escape");
}

async function visibilityChecks(page, partial) {
  await page.getByRole("button", { name: "Hide Body 1", exact: true }).click();
  await worldClick(page, [19, 0, 3]);
  await chooseTool(page, "revolve", "revolve");
  await hover(page, wallPoint);
  assert.equal(await guide(page).count(), 0, "Hidden body supplies no cylindrical axis");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Show Body 1", exact: true }).click();
  if (!partial) return;
  await worldClick(page, [19, 0, 3]);
  await chooseTool(page, "revolve", "revolve");
  await orient(page, [-1, -1, 1]);
  await hover(page, [12, 0, 6]);
  assert.equal(
    await guide(page).count(),
    0,
    "Near planar cut face occludes the cylindrical wall behind it",
  );
  assert.equal((await inspect(page)).preview, null);
  await page.keyboard.press("Escape");
}

await mkdir(".cache/cylindrical-axis", { recursive: true });
for (const partial of [false, true])
  await writeFile(
    `.cache/cylindrical-axis/${partial}.freac`,
    await cylindricalAxisFixture(partial),
  );
const server = await createServer({ server: { port: 0 } });
await server.listen();
async function check(page, name, electron = false) {
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const partial of [false, true]) await route(page, name, partial);
  await revolveRoute(page, name, electron);
  assert.deepEqual(errors, []);
}
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.FREAC_TEST_BROWSER && process.env.FREAC_TEST_BROWSER !== name) continue;
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      await page.goto(server.resolvedUrls.local[0]);
      await check(page, name);
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
      await check(await app.firstWindow(), "electron", true);
    } finally {
      await app.close();
    }
  }
} finally {
  await server.close();
}
