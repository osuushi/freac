import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { shellSweepRoute } from "./ui-shell-sweep.mjs";

async function run(page, name, app) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await shellSweepRoute(page, name, app);
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
