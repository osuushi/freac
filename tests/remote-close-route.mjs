import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { launchElectron, saveDocument } from "./native-documents.mjs";
import { project } from "./ui-blend-edit.mjs";
import { at, drag, inspect, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function computerCommand(app, page, command) {
  await page.evaluate(() => {
    window.testCommand = null;
  });
  await app.evaluate(({ Menu, app }, command) => {
    if (command === "quit") app.quit();
    else
      Menu.getApplicationMenu()
        .items.find((item) => item.label === "File")
        .submenu.items.find((item) => item.label === "Close")
        .click();
  }, command);
  await page.waitForFunction((command) => window.testCommand === command, command);
}
async function makeSketch(desktop, file) {
  await settled(desktop);
  await chooseTool(desktop, "Sketch on XY", "sketch-xy");
  await desktop.keyboard.press("r");
  await drag(desktop, [-15, -10], [15, 10]);
  await desktop.keyboard.press("Escape");
  await saveDocument(desktop, file);
  await desktop.getByRole("button", { name: "Trackpad", exact: true }).click();
  await desktop.getByRole("button", { name: "Tablet", exact: true }).click();
  return desktop.locator(".ipad-addresses a").first().getAttribute("href");
}
async function temporaryExtrusion(page) {
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  const pick = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("5");
  await settled(page);
}
async function failedAndHeldClose(app, page, command) {
  const draft = page.getByRole("textbox", { name: "Draft value", exact: true });
  await page
    .getByRole("combobox", { name: "Draft measurement", exact: true })
    .selectOption("offset");
  await draft.fill("-11");
  assert.equal((await inspect(page)).preview, null, "native collapsed draft is rejected");
  await computerCommand(app, page, command);
  assert.equal((await inspect(page)).interaction.kind, "extrude");
  assert.equal(await page.locator("dialog[open]").count(), 0);
  await draft.fill("0");
  await settled(page);
  const handle = await page
    .getByRole("button", { name: "Drag extrusion", exact: true })
    .boundingBox();
  const from = await project(page, [0, 0, 5]),
    to = await project(page, [0, 0, 7]);
  await page.evaluate(() =>
    document.addEventListener(
      "gotpointercapture",
      (event) => {
        window.testCapture = { element: event.target, id: event.pointerId };
      },
      { once: true },
    ),
  );
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    handle.x + handle.width / 2 + to.x - from.x,
    handle.y + handle.height / 2 + to.y - from.y,
  );
  assert.ok(
    await page.evaluate(() => window.testCapture?.element.hasPointerCapture(window.testCapture.id)),
    "real held extrusion capture",
  );
  await computerCommand(app, page, command);
  assert.equal(
    (await inspect(page)).document.bodies?.length ?? 0,
    0,
    "held tool remains temporary",
  );
  await page.mouse.up();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("5");
  await settled(page);
}
export async function remoteCloseRoute(engine, name, command, file) {
  const app = await launchElectron({
    args: ["."],
    env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1", MAKESHIFT_DEV_URL: "" },
  });
  let browser;
  try {
    const desktop = await app.firstWindow();
    const url = await makeSketch(desktop, file);
    browser = await engine.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    page.setDefaultTimeout(12000);
    await page.goto(url);
    await settled(page);
    await temporaryExtrusion(page);
    await page.reload();
    await settled(page);
    assert.equal(
      (await inspect(page)).preview,
      null,
      "disconnect still discards the temporary tool",
    );
    assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
    await page.evaluate(() =>
      window.makeshiftDocument.onCommand((command) => {
        window.testCommand = command;
      }),
    );
    await temporaryExtrusion(page);
    await failedAndHeldClose(app, page, command);
    assert.equal((await inspect(page)).preview.bodies[0].volume, 3000);
    await computerCommand(app, page, command);
    const dialog = page.locator("dialog[open]");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    let state = await inspect(page);
    assert.equal(state.preview, null);
    assert.equal(state.document.bodies[0].volume, 3000);
    assert.equal(
      await page.locator(".ipad-connection:visible").count(),
      0,
      "Cancel retains browser control",
    );
    await chooseTool(page, "undo", "undo");
    assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
    await chooseTool(page, "redo", "redo");
    assert.equal((await inspect(page)).document.bodies[0].volume, 3000);
    const closed = desktop.waitForEvent("close");
    await computerCommand(app, page, command);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await closed;
    await page.getByRole("button", { name: "Reconnect", exact: true }).waitFor();
    state = JSON.parse(await readFile(file, "utf8"));
    assert.equal(state.document.bodies.length, 1);
    console.log(
      `${name}: computer ${command} preserves failed/held tools, completes release before Cancel, retains Undo/Redo and saves before shutdown`,
    );
  } finally {
    await browser?.close();
    await app.evaluate(({ app }) => app.exit()).catch(() => {});
    await app.close();
  }
}
