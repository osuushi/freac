import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { plate } from "./ui-body-fillet.mjs";
import { drag, inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function reorder(page, from, to) {
  const row = (name) =>
    page.locator(".entity-viewer").getByRole("button", { name: `Select ${name}`, exact: true });
  const a = await row(from).boundingBox(),
    b = await row(to).boundingBox();
  assert.ok(a && b);
  const original = (await inspect(page)).document;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height - 2, { steps: 10 });
  assert.deepEqual(
    (await inspect(page)).document,
    original,
    "Dragging does not mutate accepted state",
  );
  await page.mouse.up();
  await inspect(page);
}
async function rangeSelectionRoute(page) {
  const row = (name) => page.getByRole("button", { name: `Select ${name}`, exact: true });
  const selected = async () => {
    await inspect(page);
    return page.locator('.entity-row > button:first-child[aria-pressed="true"]').allTextContents();
  };
  await row("Body 1").click();
  await row("Sketch 1").click({ modifiers: ["Shift"] });
  assert.deepEqual(await selected(), ["Body 1", "Sketch 2", "Sketch 1"]);
  await row("Sketch 2").click({ modifiers: ["Shift"] });
  assert.deepEqual(await selected(), ["Body 1", "Sketch 2"], "Shift contracts the range");
  await row("Sketch 1").click();
  await row("Body 1").click({ modifiers: ["Shift"] });
  assert.deepEqual(await selected(), ["Body 1", "Sketch 2", "Sketch 1"], "Reverse range");
  await row("Sketch 2").click({ modifiers: ["Meta"] });
  assert.deepEqual(await selected(), ["Body 1", "Sketch 1"], "Command removes one row");
  await row("Sketch 2").click({ modifiers: ["Meta", "Shift"] });
  assert.deepEqual(await selected(), ["Body 1", "Sketch 2", "Sketch 1"], "Command wins over Shift");
  await row("Sketch 1").click({ modifiers: ["Shift"] });
  assert.deepEqual(await selected(), ["Sketch 2", "Sketch 1"], "Toggle click resets anchor");
  if (process.platform !== "darwin") {
    await row("Sketch 2").click({ modifiers: ["Control"] });
    assert.deepEqual(await selected(), ["Sketch 1"], "Control toggles one row");
  }
  await page.getByRole("button", { name: "Hide Sketch 2", exact: true }).click();
  await row("Body 1").click();
  await row("Sketch 1").click({ modifiers: ["Shift"] });
  assert.deepEqual(await selected(), ["Body 1", "Sketch 2", "Sketch 1"], "Hidden rows join range");
  const before = (await inspect(page)).document;
  await page.keyboard.press("Delete");
  const deleted = (await inspect(page)).document;
  assert.equal(deleted.sketches.length, 1, "Sketch outside the range remains");
  assert.equal(deleted.bodies.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before, "Range deletion is one geometry Undo");
  await row("Sketch 1").click({ modifiers: ["Shift"] });
  assert.deepEqual(await selected(), ["Sketch 1"], "Deleted anchor falls back to clicked row");
  await page.getByRole("button", { name: "Show Sketch 2", exact: true }).click();
}
async function route(page, name) {
  page.setDefaultTimeout(15000);
  await plate(page);
  await page.keyboard.press("Escape");
  for (const plane of ["XZ", "YZ"]) {
    await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
    await page.keyboard.press("l");
    await drag(page, [20, 20], [30, 30]);
    await chooseTool(page, "return to modeling", "modeling");
  }
  await reorder(page, "Sketch 1", "Sketch 2");
  await rangeSelectionRoute(page);
  console.log(
    `${name}: entity range, contraction, reverse, toggles, hidden/reordered rows, Delete/Undo passed`,
  );
}
await mkdir(".cache/sketch-review", { recursive: true });
const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  for (const [name, type] of Object.entries({ chromium, webkit })) {
    const browser = await type.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      await page.goto(server.resolvedUrls.local[0]);
      await route(page, name);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
