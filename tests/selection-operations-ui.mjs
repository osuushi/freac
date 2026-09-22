import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { entityDeleteRoute } from "./ui-entity-delete.mjs";
import { mixedSelectionRoute } from "./ui-mixed-selection.mjs";
import { modelToolsRoute } from "./ui-model-tools.mjs";
import { selectionOperationsRoute } from "./ui-selection-operations.mjs";

async function run(page, name, app) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (!process.argv.includes("--mixed")) await selectionOperationsRoute(page, name);
  await mixedSelectionRoute(page, name, app);
  if (!process.argv.includes("--mixed")) {
    await modelToolsRoute(page, name);
    await entityDeleteRoute(page, name);
  }
  assert.deepEqual(errors, []);
}
const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      await page.goto(server.resolvedUrls.local[0]);
      await run(page, name);
    } finally {
      await browser.close();
    }
  }
  const app = await launchElectron({
    args: ["."],
    env: {
      ...process.env,
      FREAC_DEV_URL: server.resolvedUrls.local[0],
      FREAC_TEST_HIDDEN: "1",
    },
  });
  try {
    await run(await app.firstWindow(), "electron", app);
  } finally {
    await app.close();
  }
} finally {
  await server.close();
}
