import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium as webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { autoUnionRoute } from "./ui-auto-union.mjs";
import { bodyChamferRoute } from "./ui-body-chamfer.mjs";
import { bodyEdgesRoute } from "./ui-body-edges.mjs";
import { bodyFilletRoute } from "./ui-body-fillet.mjs";
import { bodyMoveRoute } from "./ui-body-move.mjs";
import { cleanupRoute } from "./ui-cleanup.mjs";
import { edgeChainRoute } from "./ui-edge-chain.mjs";
import { extrudeDraftRoute } from "./ui-extrude-draft.mjs";
import { faceOffsetRoute } from "./ui-face-offset.mjs";
import { modelToolsRoute } from "./ui-model-tools.mjs";
import { revolveRoute } from "./ui-revolve.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
async function run(page, name, app) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(() => !!window.freacInspect);
  await modelToolsRoute(page, name);
  if (process.argv.includes("--adjacent")) {
    for (const route of [
      bodyEdgesRoute,
      bodyMoveRoute,
      bodyFilletRoute,
      bodyChamferRoute,
      faceOffsetRoute,
      revolveRoute,
      cleanupRoute,
      extrudeDraftRoute,
      autoUnionRoute,
    ])
      await route(page, name, app);
  }
  if (process.argv.includes("--chains")) await edgeChainRoute(page, name);
  assert.deepEqual(errors, []);
}
if (process.argv.includes("--electron")) {
  const app = await launchElectron({
    args: ["."],
    env: { ...process.env, FREAC_TEST_HIDDEN: "1" },
  });
  try {
    await run(await app.firstWindow(), "electron", app);
  } finally {
    await app.close();
  }
} else {
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
  } finally {
    await server.close();
  }
}
