import assert from "node:assert/strict";
import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import WebSocket from "ws";
import { tabletAgentRoute } from "./ipad-agent.mjs";
import { tabletInputRoute } from "./ipad-input.mjs";
import { installPenClassification } from "./ipad-pen.mjs";
import { tabletSolidRoute } from "./ipad-solid.mjs";
import { launchElectron } from "./native-documents.mjs";
import { drag, inspect, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

await mkdir(".cache/ipad", { recursive: true });
const app = await launchElectron({
  args: ["."],
  env: { ...process.env, FREAC_TEST_HIDDEN: "1", FREAC_DEV_URL: "" },
});
try {
  const desktop = await app.firstWindow();
  await settled(desktop);
  await desktop.getByRole("button", { name: "iPad", exact: true }).click();
  await desktop.getByRole("heading", { name: "Freac on iPad" }).waitFor();
  assert.equal(await desktop.locator("canvas").count(), 0);
  assert.match(await desktop.locator(".wifi-warning").innerText(), /Only use on secure Wi-Fi/);
  const url = await desktop.locator(".ipad-addresses a").first().getAttribute("href");
  await desktop.screenshot({ path: ".cache/ipad/desktop.png" });
  // An unauthenticated connection must never reach model/agent/files.
  const unauth = new WebSocket(`ws://${new URL(url).host}/connect`, {
    origin: new URL(url).origin,
  });
  await new Promise((done) => {
    unauth.on("open", () => unauth.send(JSON.stringify({ token: "wrong" })));
    unauth.on("close", done);
  });
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.FREAC_TEST_BROWSER && process.env.FREAC_TEST_BROWSER !== name) continue;
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
      });
      await installPenClassification(page);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(url);
      await settled(page);
      await desktop
        .getByText("iPad connected · This document is controlled from the browser")
        .waitFor();
      assert.equal(await page.locator(".wifi-banner").innerText(), "Only use on secure Wi-Fi");
      assert.equal(await page.getByRole("button", { name: "Open agent terminal" }).count(), 1);
      const second = await browser.newPage();
      await second.goto(url);
      await second.getByRole("button", { name: "Reconnect", exact: true }).waitFor();
      assert.equal(await second.locator("canvas").count(), 0);
      await second.close();
      await chooseTool(page, "new document", "new");
      const discard = page.getByRole("button", { name: "Don’t Save", exact: true });
      if (await discard.isVisible()) await discard.click();
      await settled(page);
      await chooseTool(page, "Sketch on XY", "sketch-xy");
      await settled(page);
      await chooseTool(page, "rectangle", "rectangle");
      await drag(page, [-10, -10], [10, 10]);
      await page.screenshot({ path: `.cache/ipad/${name}-draw.png` });
      let document = (await inspect(page)).document;
      assert.equal(
        document.sketches[0]?.curves.length,
        4,
        JSON.stringify(
          await page.evaluate(async () => ({
            state: window.freacInspect(),
            status: document.querySelector(".status")?.textContent,
            history: await window.freacHistory(),
          })),
        ),
      );
      await chooseTool(page, "undo", "undo");
      await settled(page);
      assert.equal((await inspect(page)).document.sketches.length, 0);
      await chooseTool(page, "redo", "redo");
      await settled(page);
      assert.deepEqual((await inspect(page)).document, document);
      // Shared keyboard path: backtick must leave sketch mode just like Escape.
      await page.locator("canvas").focus();
      await page.keyboard.press("Backquote");
      await settled(page);
      await page.keyboard.press("Backquote");
      await settled(page);
      assert.equal((await inspect(page)).activePlane, null);
      document = await tabletInputRoute(page, name);
      document = await tabletSolidRoute(page, name);
      await tabletAgentRoute(page);
      await chooseTool(page, "save document", "save");
      const path = resolve(`.cache/ipad/${name}.freac`);
      await rm(path, { force: true });
      await page.getByLabel("Computer folder path").fill(resolve(".cache/ipad"));
      await page.getByLabel("Computer folder path").press("Enter");
      await page.getByLabel("File name").fill(`${name}.freac`);
      await page.locator("dialog").getByRole("button", { name: "Save", exact: true }).click();
      await settled(page);
      assert.ok((await readFile(path)).length > 100);
      await chooseTool(page, "open document", "open");
      await page
        .locator("dialog")
        .getByRole("button", { name: `${name}.freac`, exact: true })
        .click();
      await page.locator("dialog").getByRole("button", { name: "Open", exact: true }).click();
      await settled(page);
      assert.deepEqual((await inspect(page)).document, document);
      await page.screenshot({ path: `.cache/ipad/${name}.png` });
      // Dropping a connection while a file prompt is open must release its host lock.
      await page.getByLabel("Modeling viewport", { exact: true }).focus();
      await page.keyboard.press("Meta+Shift+s");
      await page.getByLabel("Computer folder path").waitFor();
      await page.getByLabel("File name").fill("literal");
      await page.getByLabel("File name").press("End");
      await page.keyboard.type("~`");
      assert.equal(await page.getByLabel("File name").inputValue(), "literal~`");
      await page.locator("dialog").getByRole("button", { name: "Cancel", exact: true }).focus();
      await page.keyboard.press("Backquote");
      await settled(page);
      assert.equal(await page.locator("dialog[open]").count(), 0);
      await page.getByLabel("Modeling viewport", { exact: true }).focus();
      await page.keyboard.press("Meta+Shift+s");
      await page.getByLabel("Computer folder path").waitFor();
      await page.reload();
      await settled(page);
      assert.deepEqual((await inspect(page)).document, document);
      assert.deepEqual(errors, []);
      console.log(
        name,
        "paired geometry, history, computer Save/Open and interrupted prompt recovery passed",
      );
      await page.close();
    } finally {
      await browser.close();
    }
    await desktop.getByText("Waiting for iPad · Scan to connect or reconnect").waitFor();
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url);
    await settled(page);
    assert.equal(
      await desktop.evaluate(async () => {
        try {
          await window.freacModel({ kind: "read" });
          return false;
        } catch {
          return true;
        }
      }),
      true,
      "Desktop model access must be excluded while iPad owns the document",
    );
    await desktop.getByRole("button", { name: "Return to computer", exact: true }).click();
    await page.getByRole("button", { name: "Reconnect", exact: true }).waitFor();
    assert.equal(await page.locator("#app").evaluate((app) => app.inert), true);
  } finally {
    await browser.close();
  }
  await settled(desktop);
  assert.equal((await inspect(desktop)).document.sketches[0].curves.length, 5);
  console.log("desktop handoff and return passed");
} finally {
  await app.close();
}
