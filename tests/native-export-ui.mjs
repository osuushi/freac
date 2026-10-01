import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { strFromU8, unzipSync } from "three/addons/libs/fflate.module.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { createServer } from "vite";
import { exportDocument, launchElectron, openDocument } from "./native-documents.mjs";
import { inspect } from "./ui-helpers.mjs";

const fixture = JSON.parse(await readFile("tests/fixtures/thread-boolean-sliver.json", "utf8"));
const document = fixture.snapshot?.document ?? fixture.document;
await mkdir(".cache/sketch-review", { recursive: true });
const server = await createServer({ server: { port: 0, watch: null, hmr: false } });
await server.listen();
try {
  for (const name of ["chromium", "webkit", "electron"]) {
    let browser, app;
    try {
      let page;
      if (name === "electron") {
        app = await launchElectron({
          args: ["."],
          env: { ...process.env, FREAC_TEST_HIDDEN: "1" },
        });
        page = await app.firstWindow();
        assert.equal(
          await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
          false,
        );
        assert.equal(await page.evaluate(() => typeof window.freacMesh?.integrate), "function");
      } else {
        browser = await { chromium, webkit }[name].launch({ headless: true });
        page = await browser.newPage();
        await page.goto(server.resolvedUrls.local[0]);
      }
      page.setDefaultTimeout(30000);
      const errors = [],
        requests = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        if (request.url().endsWith("/mesh-export") && request.method() === "POST")
          requests.push(request);
      });
      await inspect(page);
      await openDocument(page, {
        name: "threaded.freac",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ format: "freac", version: 1, document })),
      });
      const before = (await inspect(page)).document;
      for (const format of ["3mf", "stl"]) {
        const path = resolve(`.cache/sketch-review/${name}-native-export.${format}`);
        await exportDocument(page, format, path);
        const bytes = await readFile(path);
        if (format === "3mf") {
          const xml = strFromU8(unzipSync(bytes)["3D/3dmodel.model"]);
          assert.equal((xml.match(/<item /g) ?? []).length, document.bodies.length);
          assert.ok((xml.match(/<triangle /g) ?? []).length > 10000);
        } else {
          const geometry = new STLLoader().parse(Uint8Array.from(bytes).buffer);
          assert.ok(geometry.attributes.position.count > 30000);
          geometry.dispose();
        }
        assert.deepEqual((await inspect(page)).document, before);
      }
      if (name !== "electron") assert.ok(requests.length >= 2, "UI must use the native backend");
      if (name === "chromium") {
        await page.route("**/mesh-export", (route) =>
          route.fulfill({ status: 404, body: "unavailable" }),
        );
        const count = requests.length;
        await exportDocument(
          page,
          "3mf",
          resolve(".cache/sketch-review/chromium-wasm-fallback.3mf"),
        );
        assert.equal(requests.length, count, "Unavailable native capability must use WASM");
      }
      assert.deepEqual(errors, []);
      console.log(
        `${name}: native STL/3MF through controls, unchanged document${name === "chromium" ? ", WASM fallback" : ""}`,
      );
    } finally {
      await browser?.close();
      await app?.close();
    }
  }
} finally {
  await server.close();
}
