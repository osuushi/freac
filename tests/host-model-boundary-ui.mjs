import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright";
import { hostModelBoundary } from "./host-model-boundary.mjs";
import { launchElectron, saveDocument } from "./native-documents.mjs";
import { drag, settled } from "./ui-helpers.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const names = runtimeNames(["chromium", "webkit"]);
const root = await mkdtemp(join(tmpdir(), "makeshift-model-boundary-"));
let app;
try {
  app = await launchElectron({
    args: ["."],
    env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1", MAKESHIFT_DEV_URL: "" },
  });
  const desktop = await app.firstWindow();
  await settled(desktop);
  await chooseTool(desktop, "Sketch on XY", "sketch-xy");
  await desktop.keyboard.press("l");
  await drag(desktop, [0, 0], [20, 10]);
  await desktop.keyboard.press("Escape");
  await hostModelBoundary(desktop);
  await saveDocument(desktop, join(root, "Drawing.makeshift"));
  await hostModelBoundary(desktop);
  console.log("electron: raw replacement rejected before and after native Save");
  await desktop.getByRole("button", { name: "Trackpad", exact: true }).click();
  await desktop.getByRole("button", { name: "Tablet", exact: true }).click();
  const url = await desktop.locator(".ipad-addresses a").first().getAttribute("href");
  for (const name of names) {
    const browser = await { chromium, webkit }[name].launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
      page.setDefaultTimeout(12000);
      await page.goto(url);
      await settled(page);
      await hostModelBoundary(page);
      await chooseTool(page, "Sketch on XY", "sketch-xy");
      await page.keyboard.press("l");
      await drag(page, [30, 0], [40, 10]);
      await page.keyboard.press("Escape");
      await hostModelBoundary(page);
      const creating = chooseTool(page, "new document", "new");
      await page.locator("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
      await creating;
      await settled(page);
      assert.equal((await page.evaluate(() => window.makeshiftDocument.status())).edited, true);
      await chooseTool(page, "save document", "save");
      await page.waitForFunction(async () => !(await window.makeshiftDocument.status()).edited);
      await hostModelBoundary(page);
      await page.close();
      console.log(
        `${name}: paired raw replacement rejected; normal Cancel New and Save retain file binding`,
      );
    } finally {
      await browser.close();
    }
    await desktop.getByText("Waiting for iPad · Scan to connect or reconnect").waitFor();
  }
} finally {
  await app?.close();
  await rm(root, { recursive: true, force: true });
}
