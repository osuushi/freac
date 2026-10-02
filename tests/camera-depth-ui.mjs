import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import * as THREE from "three";
import { createServer } from "vite";
import { launchElectron, openDocument } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Supply a founder Capture fixture; geometry enters via the ordinary Open command.
const { snapshot } = JSON.parse(await readFile(process.argv[2], "utf8"));
function cameraFor(state, box) {
  const c = state.camera,
    h = c.height / 2,
    w = (h * box.width) / box.height;
  const camera = new THREE.OrthographicCamera(-w, w, h, -h, c.near, c.far);
  camera.position.fromArray(c.position);
  camera.up.fromArray(c.up);
  camera.lookAt(new THREE.Vector3(...c.target));
  camera.updateMatrixWorld();
  return camera;
}
async function checkDepth(page) {
  const state = await inspect(page);
  const box = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
  const camera = cameraFor(state, box);
  for (const body of state.document.bodies)
    for (const face of body.faces)
      for (let i = 0; i < face.vertices.length; i += 3) {
        const p = new THREE.Vector3().fromArray(face.vertices, i).project(camera);
        assert.ok(p.z > -1 && p.z < 1, `Body ${body.id} clipped at depth ${p.z}`);
      }
  return { state, camera, box };
}
async function pickUpperBody(page) {
  const { state, camera, box } = await checkDepth(page);
  const body = state.document.bodies[2];
  const candidates = [];
  for (const face of body.faces)
    for (let i = 0; i < face.vertices.length; i += 9) {
      const [a, b, c] = [0, 3, 6].map((o) => new THREE.Vector3().fromArray(face.vertices, i + o));
      const center = a.clone().add(b).add(c).divideScalar(3);
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      if (normal.dot(camera.position.clone().sub(center)) <= 0) continue;
      const p = center.project(camera);
      if (Math.abs(p.x) > 0.9 || Math.abs(p.y) > 0.9) continue;
      candidates.push({
        area: normal.length(),
        x: box.x + ((p.x + 1) * box.width) / 2,
        y: box.y + ((1 - p.y) * box.height) / 2,
      });
    }
  candidates.sort((a, b) => b.area - a.area);
  assert.ok(candidates.length);
  for (const p of candidates.slice(0, 10)) {
    await page.mouse.click(p.x, p.y);
    if ((await inspect(page)).modelingSelection.some((t) => t.body === body.id)) return;
  }
  assert.fail("Visible upper-body geometry must be pickable through real canvas clicks");
}
async function route(page, name) {
  await inspect(page);
  await openDocument(page, {
    name: "depth-fixture.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "makeshift", version: 1, document: snapshot.document }),
    ),
  });
  const original = (await inspect(page)).document;
  const normal = snapshot.camera.position.map((p, i) => p - snapshot.camera.target[i]);
  // Match viewing direction through actual Command-drag, then zoom out to reveal the whole scene.
  await orient(page, normal);
  const box = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, Math.log(300 / (await inspect(page)).camera.height) / 0.01);
  await page.keyboard.up("Control");
  await page.waitForTimeout(100);
  await checkDepth(page);
  await pickUpperBody(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-camera-depth.png` });
  await page.keyboard.press("Escape");
  for (const direction of [
    [1, 1, 1],
    [-1, -1, -1],
    [0, 0, 1],
  ]) {
    await orient(page, direction);
    await checkDepth(page);
  }
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await checkDepth(page);
  await chooseTool(page, "return to modeling", "modeling");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    `${name}: captured bodies stay inside camera depth through zoom, orbit and sketch entry; upper body canvas selection works`,
  );
}
await mkdir(".cache/sketch-review", { recursive: true });
const [name] = runtimeNames(["chromium", "webkit", "electron"], ["chromium"]);
let server, browser, app;
try {
  let page;
  if (name === "electron") {
    app = await launchElectron({
      args: ["."],
      env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
    });
    page = await app.firstWindow();
    assert.equal(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
      false,
    );
  } else {
    server = await createServer({ server: { port: 0 } });
    await server.listen();
    browser = await { chromium, webkit }[name].launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    await page.goto(server.resolvedUrls.local[0]);
  }
  await route(page, name);
} finally {
  await browser?.close();
  await app?.close();
  await server?.close();
}
