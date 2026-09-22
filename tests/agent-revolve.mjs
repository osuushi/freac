import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { manualHelix } from "./agent-revolve-manual.mjs";
import { scriptBrowser } from "./agent-script-browser.mjs";
import { launchElectron, openDocument, saveDocument } from "./native-documents.mjs";
import { inspect, reset, settled } from "./ui-helpers.mjs";
import { orient, pick } from "./ui-measurement.mjs";
import { chooseTool } from "./ui-tools.mjs";

const name = process.env.FREAC_TEST_BROWSER ?? "electron";
let app,
  web,
  page,
  workspace,
  sequence = 0;
const source = `
const base = await freac.createSketch({plane:"XY",curves:[{kind:"circle",center:{x:0,y:0},radius:6}]});
const shaft = await freac.extrude({sources:base.profiles,distance:12,mode:"new"});
const points = [{x:5,y:1},{x:6.5,y:0.5},{x:6.5,y:1.5}];
const section = await freac.createSketch({plane:"XZ",curves:points.map((a,i)=>({kind:"segment",a,b:points[(i+1)%3]}))});
await freac.revolve({sources:section.profiles,axis:{origin:[0,0,0],direction:[0,0,1]},angle:720,height:8,mode:"subtract",targets:[shaft.bodies[0].id]});
`;
try {
  await mkdir(".cache/sketch-review", { recursive: true });
  if (name === "electron") {
    app = await launchElectron({ args: ["."], env: { ...process.env, FREAC_TEST_HIDDEN: "1" } });
    page = await app.firstWindow();
  } else {
    web = await scriptBrowser(name);
    ({ page, workspace } = web);
  }
  page.setDefaultTimeout(20000);
  await manualHelix(page);
  await reset(page);
  if (app) {
    await page.evaluate(() =>
      window.freacAgent.request({
        kind: "configure",
        preferences: { preset: "custom", executable: "/bin/sh", args: ["-i"], env: {} },
      }),
    );
    await page.getByRole("button", { name: "Open agent terminal" }).click();
    await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
    workspace = (await page.evaluate(() => window.freacAgent.request({ kind: "read" }))).workspace;
  }
  const empty = (await inspect(page)).document;
  await assert.rejects(
    () =>
      run(
        `await freac.revolve({sources:[],axis:{origin:[0,0,0],direction:[0,0,1]},angle:720,height:"pitch",mode:"new"});`,
      ),
    /typecheck failed/,
  );
  await run(source);
  const threaded = (await inspect(page)).document;
  assert.equal(threaded.sketches.length, 2);
  assert.equal(threaded.bodies.length, 1);
  assert(Math.abs(threaded.bodies[0].volume - (432 * Math.PI - (68 * Math.PI) / 9)) < 0.01);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, empty);
  await assert.rejects(
    () => run(`${source}\nthrow new Error("rollback helix");`),
    /rollback helix/,
  );
  assert.deepEqual((await inspect(page)).document, empty);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, threaded);
  await orient(page, [0, 0, 1]);
  const selected = await pick(page, [0, 0, 12]);
  assert.equal(selected.modelingSelection[0].kind, "face");
  await page.getByRole("textbox", { name: "Face offset distance", exact: true }).fill("1");
  await settled(page);
  // Record the separately discovered native limitation instead of counting this
  // attempted offset as successful re-editing. The rejected edit must be atomic.
  assert.match(await page.locator(".status").textContent(), /BRep_API: command not done/);
  assert(await page.getByRole("button", { name: "Accept face offset", exact: true }).isDisabled());
  assert.deepEqual((await inspect(page)).document, threaded);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "move", "move");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("3");
  await page.keyboard.press("Enter");
  const moved = (await inspect(page)).document;
  assert(Math.abs(moved.bodies[0].center[0] - threaded.bodies[0].center[0] - 3) < 1e-6);
  assert(Math.abs(moved.bodies[0].volume - threaded.bodies[0].volume) < 1e-6);
  assert.deepEqual(moved.sketches, threaded.sketches);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, threaded);
  await orient(page, [0.7, -1, 0.6]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-agent-helix.png` });
  if (app) await page.evaluate(() => window.freacAgent.request({ kind: "stop" }));
  const file = resolve(`.cache/sketch-review/${name}-agent-helix.freac`);
  await saveDocument(page, file);
  await reset(page);
  await openDocument(page, file);
  const reopened = (await inspect(page)).document;
  assert.deepEqual(reopened.sketches, threaded.sketches);
  assert.equal(reopened.bodies.length, 1);
  const restored = reopened.bodies[0],
    expected = threaded.bodies[0];
  // Loading regenerates meshes and normalizes OCCT frame directions. Compare
  // every BRep token at tighter-than-model precision, plus exact topology IDs.
  assert.equal(restored.id, expected.id);
  sameBrep(restored.brep, expected.brep);
  assert.deepEqual(
    restored.faces.map((f) => f.id),
    expected.faces.map((f) => f.id),
  );
  assert.deepEqual(
    restored.edges.map((e) => e.id),
    expected.edges.map((e) => e.id),
  );
  assert(Math.abs(restored.volume - expected.volume) < 1e-6);
  console.log(
    `PASS ${name}: manual helical Revolve; typed CLI helical cut; atomic Undo/Redo and error rollback; manual body movement; Save/Open. Known native top-face offset failure preserves geometry.`,
  );
} catch (error) {
  if (page) {
    await writeFile(
      `.cache/sketch-review/${name}-agent-helix-failure.json`,
      JSON.stringify(await page.evaluate(() => window.freacInspect())),
    );
    await page.screenshot({ path: `.cache/sketch-review/${name}-agent-helix-failure.png` });
  }
  throw error;
} finally {
  if (app) {
    await page
      ?.getByLabel("Modeling viewport", { exact: true })
      .click({ position: { x: 20, y: 20 } })
      .catch(() => {});
    await page?.keyboard.press("Escape").catch(() => {});
    await page?.evaluate(() => window.freacAgent.request({ kind: "stop" })).catch(() => {});
    await app.close();
  }
  await web?.close();
}

function sameBrep(actual, expected) {
  const tokens = (value) => Buffer.from(value, "hex").toString("utf8").split(/\s+/);
  const a = tokens(actual),
    b = tokens(expected);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    const x = Number(a[i]),
      y = Number(b[i]);
    assert(Number.isFinite(x) && Number.isFinite(y), `BRep token ${i} changed`);
    assert(
      Math.abs(x - y) <= 1e-12 * Math.max(1, Math.abs(x), Math.abs(y)),
      `BRep value ${i} changed`,
    );
  }
}

async function run(source) {
  const prefix = `helix-${++sequence}`;
  await writeFile(join(workspace, `${prefix}.ts`), source);
  if (web) {
    try {
      await promisify(execFile)(web.env.FREAC_CLI, ["run", `${prefix}.ts`], {
        cwd: workspace,
        env: web.env,
        timeout: 30000,
      });
      await settled(page);
      return;
    } catch (error) {
      throw new Error(error.stderr || error.message);
    }
  }
  await page.locator(".agent-screen textarea").focus();
  await page.keyboard.type(
    `freac run ${prefix}.ts > ${prefix}.json 2> ${prefix}.err; printf '%s' "$?" > ${prefix}.done`,
  );
  await page.keyboard.press("Enter");
  for (let attempt = 0; attempt < 1000; attempt++) {
    const exit = await readFile(join(workspace, `${prefix}.done`), "utf8").catch(() => "");
    if (exit) {
      if (exit !== "0") throw new Error(await readFile(join(workspace, `${prefix}.err`), "utf8"));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error("Script CLI did not finish");
}
