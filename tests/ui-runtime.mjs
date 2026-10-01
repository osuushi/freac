import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";

export function runtimeNames(allowed = ["chromium", "webkit", "electron"], defaults = allowed) {
  const requested = process.env.FREAC_TEST_BROWSER;
  if (requested && !allowed.includes(requested))
    throw new Error(`Unsupported FREAC_TEST_BROWSER: ${requested}. Choose ${allowed.join(", ")}.`);
  assert.ok(allowed.length, "A UI route must declare at least one supported runtime");
  assert.ok(
    defaults.length && defaults.every((name) => allowed.includes(name)),
    "UI defaults must be supported and nonempty",
  );
  return requested ? [requested] : defaults;
}

/** Own the server, browser/app, isolated Electron profile and page for each route. */
export async function withUiRuntimes(
  route,
  { allowed, defaults, viewport = { width: 1280, height: 850 }, timeout = 12000 } = {},
) {
  const names = runtimeNames(allowed, defaults);
  await mkdir(".cache/sketch-review", { recursive: true });
  const server = await createServer({ server: { port: 0, watch: null, hmr: false } });
  try {
    await server.listen();
    for (const name of names) {
      let browser, app;
      try {
        let page;
        if (name === "electron") {
          app = await launchElectron({
            args: ["."],
            env: {
              ...process.env,
              FREAC_TEST_HIDDEN: "1",
              FREAC_DEV_URL: server.resolvedUrls.local[0],
            },
          });
          page = await app.firstWindow();
          assert.equal(
            await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
            false,
          );
        } else {
          browser = await { chromium, webkit }[name].launch({ headless: true });
          page = await browser.newPage({ viewport });
          await page.goto(server.resolvedUrls.local[0]);
        }
        page.setDefaultTimeout(timeout);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.waitForFunction(() => Boolean(window.freacInspect));
        await route(page, name);
        assert.deepEqual(errors, []);
      } finally {
        await browser?.close();
        await app?.close();
      }
    }
  } finally {
    await server.close();
  }
}
