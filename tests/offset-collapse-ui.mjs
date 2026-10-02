import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { offsetCollapseRoute } from "./ui-offset-collapse.mjs";
import { offsetContactRoute } from "./ui-offset-contact.mjs";
import { runtimeNames } from "./ui-runtime.mjs";

async function run(page, name, app) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await offsetCollapseRoute(page, name, app);
  await offsetContactRoute(page, name, app);
  assert.deepEqual(errors, []);
}
const names = runtimeNames(["chromium", "webkit", "electron"]);
const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([name]) =>
    names.includes(name),
  )) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      await page.goto(server.resolvedUrls.local[0]);
      await run(page, name);
    } finally {
      await browser.close();
    }
  }
  if (names.includes("electron")) {
    const app = await launchElectron({
      args: ["."],
      env: {
        ...process.env,
        MAKESHIFT_DEV_URL: server.resolvedUrls.local[0],
        MAKESHIFT_TEST_HIDDEN: "1",
      },
    });
    try {
      await run(await app.firstWindow(), "electron", app);
    } finally {
      await app.close();
    }
  }
} finally {
  await server.close();
}
