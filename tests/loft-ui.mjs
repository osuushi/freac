import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { loftRoute } from "./ui-loft.mjs";
import { loftHolesRoute } from "./ui-loft-holes.mjs";
import { revolveRoute } from "./ui-revolve.mjs";
import { runtimeNames } from "./ui-runtime.mjs";

const names = runtimeNames();
const server = await createServer({ server: { port: 0, watch: null, hmr: false } });
await server.listen();
async function check(page, name) {
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await loftRoute(page, name);
  await loftHolesRoute(page, name);
  await revolveRoute(page, `${name}-loft-regression`);
  assert.deepEqual(errors, []);
}
try {
  for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([name]) =>
    names.includes(name),
  )) {
    if (process.env.FREAC_TEST_BROWSER && process.env.FREAC_TEST_BROWSER !== name) continue;
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
      await page.goto(server.resolvedUrls.local[0]);
      await check(page, name);
    } finally {
      await browser.close();
    }
  }
  if (names.includes("electron")) {
    const app = await launchElectron({
      args: ["."],
      env: { ...process.env, FREAC_TEST_HIDDEN: "1", FREAC_DEV_URL: server.resolvedUrls.local[0] },
    });
    try {
      const page = await app.firstWindow();
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(1440, 950),
      );
      await page.waitForFunction(() => innerWidth === 1440 && innerHeight === 950);
      await check(page, "electron");
    } finally {
      await app.close();
    }
  }
} finally {
  await server.close();
}
