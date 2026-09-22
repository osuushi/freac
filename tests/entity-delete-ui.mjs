import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { entityDeleteRoute } from "./ui-entity-delete.mjs";

const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  for (const [name, browserType] of Object.entries({ chromium, webkit })) {
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      await page.goto(server.resolvedUrls.local[0]);
      await entityDeleteRoute(page, name);
    } finally {
      await browser.close();
    }
  }
  const app = await launchElectron({
    args: ["."],
    env: { ...process.env, FREAC_DEV_URL: server.resolvedUrls.local[0], FREAC_TEST_HIDDEN: "1" },
  });
  try {
    const page = await app.firstWindow();
    await entityDeleteRoute(page, "electron");
  } finally {
    await app.close();
  }
  assert.ok(true);
} finally {
  await server.close();
}
