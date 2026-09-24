import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { inspect, reset } from "./ui-helpers.mjs";
import { chooseTool, toolEnabled } from "./ui-tools.mjs";

const fixture = JSON.parse(await readFile("tests/fixtures/slow-face-delete.json", "utf8"));
async function selectFace(page) {
  const face = fixture.document.bodies[0].faces.find((f) => f.id === fixture.face);
  await orient(page, face.offsetHandle.normal);
  const point = await project(page, face.offsetHandle.center);
  await page.mouse.click(point.x, point.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.face, fixture.face);
}
async function navigation(page) {
  const initial = await page.evaluate(() => window.freacInspect().camera);
  await page.mouse.move(1000, 620);
  await page.mouse.wheel(40, 30);
  await page.waitForFunction(
    (target) => window.freacInspect().camera.target.some((v, i) => v !== target[i]),
    initial.target,
  );
  const panned = await page.evaluate(() => window.freacInspect().camera);
  await orient(page, [0.5, 0.5, 1]);
  await page.waitForFunction(
    (position) => window.freacInspect().camera.position.some((v, i) => v !== position[i]),
    panned.position,
  );
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -20);
  await page.keyboard.up("Control");
  await page.waitForFunction(
    (height) => window.freacInspect().camera.height < height,
    initial.height,
  );
  const beforeDrag = await page.evaluate(() => window.freacInspect().camera.target);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(970, 600, { steps: 4 });
  await page.mouse.up({ button: "middle" });
  await page.waitForFunction(
    (target) => window.freacInspect().camera.target.some((v, i) => v !== target[i]),
    beforeDrag,
  );
  assert.equal(await page.evaluate(() => window.freacInspect().solving), true);
}
export async function calculationRoute(page, name) {
  await reset(page);
  await openDocument(page, {
    name: "slow-delete.freac",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "freac", version: 1, document: fixture.document }),
    ),
  });
  await inspect(page);
  await selectFace(page);
  const before = await inspect(page);
  const undo = await toolEnabled(page, "undo", "undo");
  for (const action of ["Escape", "button"]) {
    await page.keyboard.press("Delete");
    await page.locator(".calculation-progress").waitFor({ state: "visible" });
    assert.match(
      await page.locator(".calculation-label").textContent(),
      /Deleting faces and edges/,
    );
    assert.equal(await toolEnabled(page, "new document", "new"), false);
    await page.evaluate(() => {
      window.calculationFrames = [];
      window.calculationFrameStart = performance.now();
      const frame = (now) => {
        window.calculationFrames.push(now - window.calculationFrameStart);
        window.calculationFrameStart = now;
        if (window.freacInspect().solving) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    if (action === "button")
      await page.screenshot({ path: `.cache/sketch-review/${name}-calculation.png` });
    await navigation(page);
    await page.waitForFunction(() => window.calculationFrames.length >= 15);
    const start = performance.now();
    if (action !== "button") await page.keyboard.press("Escape");
    if (action === "button")
      await page.getByRole("button", { name: "Cancel calculation", exact: true }).click();
    const state = await inspect(page);
    assert.ok(performance.now() - start < 1500, "Cancellation remains prompt");
    assert.deepEqual(state.document, before.document);
    assert.deepEqual(state.modelingSelection, before.modelingSelection);
    assert.equal(state.preview, null);
    assert.equal(await toolEnabled(page, "undo", "undo"), undo);
    const history = await page.evaluate(() => window.freacHistory());
    assert.equal(history.at(-1).outcome, "cancelled");
    assert.match(history.at(-1).error, /cancelled/);
    const gaps = await page.evaluate(() => window.calculationFrames);
    console.log(
      `${name} ${action}: ${gaps.length} animation frames, maximum gap ${Math.max(...gaps).toFixed(1)} ms`,
    );
    assert.ok(Math.max(...gaps) < 500, "No long renderer stall during kernel work");
    await page.locator(".calculation-progress").waitFor({ state: "hidden" });
  }
  // Watchdog expiry is covered with an explicit short deadline in native-calculator.test.ts.
  // This real operation can now finish before the production five-minute watchdog.
  // An ordinary successful edit still works after cancellations and a killed calculator.
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.keyboard.press("Delete");
  assert.equal((await inspect(page)).document.bodies.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before.document);
  console.log(`${name}: captured deletion camera, cancellation, history and next edit pass`);
}
