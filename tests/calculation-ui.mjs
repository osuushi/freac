import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { delayedBackend } from "./ui-backend.mjs";
import { calculationRoute } from "./ui-calculation.mjs";
import { shellCalculationRoute } from "./ui-calculation-shell.mjs";
import { cameraRoute } from "./ui-camera.mjs";
import { interactionLifecycleRoute } from "./ui-interaction-lifecycle.mjs";

async function run(page, name) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await calculationRoute(page, name);
  await shellCalculationRoute(page, name);
  await cameraRoute(page, name);
  await interactionLifecycleRoute(page, name);
  if (name !== "electron") await delayedBackend(page, name);
  assert.deepEqual(errors, []);
}
const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.FREAC_TEST_BROWSER && process.env.FREAC_TEST_BROWSER !== name) continue;
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      await page.goto(server.resolvedUrls.local[0]);
      await run(page, name);
    } finally {
      await browser.close();
    }
  }
  if (!process.env.FREAC_TEST_BROWSER || process.env.FREAC_TEST_BROWSER === "electron") {
    const app = await launchElectron({
      args: ["."],
      env: { ...process.env, FREAC_DEV_URL: server.resolvedUrls.local[0], FREAC_TEST_HIDDEN: "1" },
    });
    try {
      await run(await app.firstWindow(), "electron");
    } finally {
      await app.close();
    }
  }
} finally {
  await server.close();
}
