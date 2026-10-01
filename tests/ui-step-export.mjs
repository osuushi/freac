import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { strFromU8, unzipSync } from "three/addons/libs/fflate.module.js";
import { createServer } from "vite";
import { exportDocument, launchElectron, openDocument } from "./native-documents.mjs";
import { readStep } from "./step-readback.mjs";
import { project } from "./ui-blend-edit.mjs";
import { close, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(await readFile("tests/fixtures/thread-boolean-sliver.json", "utf8"));
const threaded = fixture.snapshot?.document ?? fixture.document;
await mkdir(".cache/sketch-review", { recursive: true });
let server;
try {
  server = await createServer({ server: { port: 0, watch: null, hmr: false } });
  await server.listen();
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
      } else {
        browser = await { chromium, webkit }[name].launch({ headless: true });
        page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
        await page.goto(server.resolvedUrls.local[0]);
      }
      page.setDefaultTimeout(60000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await reset(page);
      assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
      const box = await createBox(page);
      await openDocument(page, {
        name: "mixed-step.freac",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({
            format: "freac",
            version: 1,
            document: { ...threaded, bodies: [...threaded.bodies, box] },
          }),
        ),
      });
      const before = (await inspect(page)).document;
      const dialog = page.getByRole("dialog", { name: "STEP export with decorators" });
      let downloads = 0;
      page.on("download", () => downloads++);
      await chooseTool(page, "export step", "export-step");
      await dialog.waitFor();
      assert.match(await dialog.textContent(), /some apps may not open them/);
      await page.screenshot({ path: `.cache/sketch-review/${name}-step-warning.png` });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      await chooseTool(page, "export step", "export-step");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await dialog.waitFor({ state: "detached" });
      assert.equal(downloads, 0);

      const exactPath = resolve(`.cache/sketch-review/${name}-exact.step`);
      await exportDocument(page, "step", exactPath, "Exact bodies only");
      const exact = readStep(exactPath);
      assert.equal(exact.length, 2);
      assert.ok(exact.every((shape) => shape.valid && shape.meshFaces === 0));
      close(exact[1].volume, 2000);
      assert.ok(Math.abs(exact[0].volume / threaded.bodies[0].volume - 1) < 1e-5);
      assert.deepEqual((await inspect(page)).document, before);

      const referencePath = resolve(`.cache/sketch-review/${name}-step-reference.3mf`);
      await exportDocument(page, "3mf", referencePath);
      const reference = meshMetrics(
        strFromU8(unzipSync(await readFile(referencePath))["3D/3dmodel.model"]),
      );
      const mixedPath = resolve(`.cache/sketch-review/${name}-decorated.step`);
      await exportDocument(page, "step", mixedPath, "Include decorators");
      const mixed = readStep(mixedPath);
      assert.equal(mixed.length, 2);
      assert.equal(mixed[0].exactFaces, 0);
      assert.equal(mixed[0].meshFaces, 1);
      assert.equal(mixed[0].triangles, reference[0].triangles);
      assert.ok(mixed[0].triangles > 10000);
      assert.ok(Math.abs(mixed[0].meshVolume - reference[0].volume) < 1e-6);
      assert.ok(
        Math.abs(mixed[0].meshVolume - exact[0].volume) > 1,
        "Decorator geometry must be included",
      );
      assert.equal(mixed[1].valid, true);
      assert.equal(mixed[1].meshFaces, 0);
      close(mixed[1].volume, 2000);
      assert.deepEqual((await inspect(page)).document, before);

      if (name === "chromium") {
        await page.route("**/mesh-export", (route) =>
          route.fulfill({ status: 404, body: "unavailable" }),
        );
        const wasmReference = resolve(".cache/sketch-review/step-wasm-reference.3mf");
        await exportDocument(page, "3mf", wasmReference);
        const metrics = meshMetrics(
          strFromU8(unzipSync(await readFile(wasmReference))["3D/3dmodel.model"]),
        );
        const wasmPath = resolve(".cache/sketch-review/step-wasm-decorated.step");
        await exportDocument(page, "step", wasmPath, "Include decorators");
        const wasm = readStep(wasmPath);
        assert.equal(wasm.length, 2);
        assert.equal(wasm[0].triangles, metrics[0].triangles);
        assert.ok(Math.abs(wasm[0].meshVolume - metrics[0].volume) < 1e-6);
        close(wasm[1].volume, 2000);
        assert.deepEqual((await inspect(page)).document, before);
        await page.unroute("**/mesh-export");
      }

      await page.getByRole("button", { name: "Hide Body 1", exact: true }).click();
      const visiblePath = resolve(`.cache/sketch-review/${name}-visible-exact.step`);
      await exportDocument(page, "step", visiblePath);
      const visible = readStep(visiblePath);
      assert.equal(visible.length, 1);
      close(visible[0].volume, 2000);
      assert.equal(await dialog.count(), 0);
      if (name === "chromium") await cancelLateDownload(page, () => downloads);
      assert.deepEqual(errors, []);
      console.log(
        `${name}: STEP warnings/cancel, exact/mesh mixture, native readback, decorator geometry and visibility pass`,
      );
    } finally {
      await browser?.close();
      await app?.close();
    }
  }
} finally {
  await server?.close();
}

async function cancelLateDownload(page, downloadCount) {
  let release, started, finished;
  const waiting = new Promise((resolve) => {
    started = resolve;
  });
  const responseGate = new Promise((resolve) => {
    release = resolve;
  });
  const completed = new Promise((resolve) => {
    finished = resolve;
  });
  const previous = downloadCount();
  await page.route("**/sketch-api", async (route) => {
    if (route.request().postDataJSON().kind !== "export-step") return route.continue();
    const response = await route.fetch();
    started();
    await responseGate;
    await route.fulfill({ response });
    finished();
  });
  try {
    await chooseTool(page, "export step", "export-step");
    await waiting;
    await chooseTool(page, "cancel export", "cancel-export");
    const delivered = page.waitForResponse(
      (response) => response.request().postDataJSON()?.kind === "export-step",
    );
    release();
    await completed;
    await delivered;
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(downloadCount(), previous, "Cancelled exports cannot download a late result");
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
}

async function createBox(page) {
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [40, -20], [60, 0]);
  await chooseTool(page, "return to modeling", "modeling");
  const pick = await project(page, [50, -10, 0]);
  await page.mouse.click(pick.x, pick.y);
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  return (await inspect(page)).document.bodies[0];
}

function meshMetrics(xml) {
  return [...xml.matchAll(/<object .*?<\/object>/g)].map(([object]) => {
    const points = [...object.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map((m) =>
      m.slice(1).map(Number),
    );
    const triangles = [...object.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)].map((m) =>
      m.slice(1).map(Number),
    );
    const volume = triangles.reduce((sum, t) => {
      const [a, b, c] = t.map((i) => points[i]);
      return (
        sum +
        (a[0] * (b[1] * c[2] - b[2] * c[1]) +
          a[1] * (b[2] * c[0] - b[0] * c[2]) +
          a[2] * (b[0] * c[1] - b[1] * c[0])) /
          6
      );
    }, 0);
    return { triangles: triangles.length, volume };
  });
}
