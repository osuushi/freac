import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { orient, project } from "./ui-blend-edit.mjs";
import { at, drag, inspect, reset, settled } from "./ui-helpers.mjs";
import { pickPlane, planeTargetsRoute } from "./ui-plane-targets.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function route(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "circle", "circle");
  await drag(page, [0, 0], [12, 0]);
  await drag(page, [0, 0], [9, 0]);
  const ring = await at(page, 11, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(ring.x, ring.y);
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("20");
  await settled(page);
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  await orient(page, [1, 0, 1]);
  await chooseTool(page, "capture fixture", "capture");
  const path = await page.getByRole("textbox", { name: "Captured fixture path" }).inputValue();
  const fixture = JSON.parse(await readFile(path, "utf8"));
  assert.equal(fixture.snapshot.document.bodies.length, 1);
  await page.keyboard.press("Escape");
  let point = await project(page, [0, 0, 16]);
  await page.mouse.move(point.x, point.y);
  assert.equal((await inspect(page)).modelingHover, "face");
  await page.mouse.click(point.x, point.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  await hold(page, point);
  await page
    .getByRole("dialog", { name: "Choose overlapping geometry" })
    .getByRole("button", { name: "Plane · YZ", exact: true })
    .click();
  assert.equal((await inspect(page)).activePlane, "YZ");
  await chooseTool(page, "return to modeling", "modeling");
  await page.keyboard.press("Escape");
  await chooseTool(page, "construction plane", "construction-plane");
  await pickPlane(page, "YZ");
  await page.keyboard.press("Enter");
  await settled(page);
  await orient(page, [1, 0, 1]);
  point = await project(page, [0, 0, 16]);
  await page.mouse.move(point.x, point.y);
  assert.equal((await inspect(page)).modelingHover, "face");
  await hold(page, point);
  await page
    .getByRole("dialog", { name: "Choose overlapping geometry" })
    .getByRole("button", { name: "Plane", exact: true })
    .click();
  assert.equal(
    await page.getByRole("button", { name: "Move plane", exact: true }).isVisible(),
    true,
  );
  assert.equal((await inspect(page)).modelingSelection.length, 0);
  const front = await project(page, [12, 0, 8]);
  await page.mouse.move(front.x, front.y);
  assert.equal((await inspect(page)).modelingHover, "face");
  await page.mouse.click(front.x, front.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  await page.getByRole("button", { name: "Hide Plane 1", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.mouse.move(point.x, point.y);
  assert.equal((await inspect(page)).modelingHover, "face");
  await page.getByRole("button", { name: "Show Plane 1", exact: true }).click();
  await hold(page, point);
  await page
    .getByRole("dialog", { name: "Choose overlapping geometry" })
    .getByRole("button", { name: "Plane", exact: true })
    .click();
  await page.getByRole("button", { name: "Sketch on plane", exact: true }).click();
  assert.ok((await inspect(page)).activePlane);
  console.log(name, "hollow cylinder plane depth passed", path);
  await planeTargetsRoute(page, name);
}
async function hold(page, p) {
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(720);
  await page.mouse.up();
}
const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      page.setDefaultTimeout(12000);
      await page.goto(server.resolvedUrls.local[0]);
      await route(page, name);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
