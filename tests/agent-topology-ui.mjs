import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { scriptBrowser } from "./agent-script-browser.mjs";
import { launchElectron, openDocument, saveDocument } from "./native-documents.mjs";
import { inspect, settled } from "./ui-helpers.mjs";
import { orient, pick } from "./ui-measurement.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const [name] = runtimeNames(undefined, ["electron"]);
let app,
  web,
  page,
  workspace,
  counter = 0;
try {
  if (name === "electron") {
    app = await launchElectron({
      args: ["."],
      env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
    });
    page = await app.firstWindow();
    await page.evaluate(() =>
      window.makeshiftAgent.request({
        kind: "configure",
        preferences: { preset: "custom", executable: "/bin/sh", args: ["-i"], env: {} },
      }),
    );
    await page.getByRole("button", { name: "Open agent terminal" }).click();
    await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
    workspace = (await page.evaluate(() => window.makeshiftAgent.request({ kind: "read" })))
      .workspace;
  } else {
    web = await scriptBrowser(name);
    ({ page, workspace } = web);
  }
  page.setDefaultTimeout(20000);
  await settled(page);
  await run(`
const s=await makeshift.createSketch({plane:"XY",curves:[{kind:"circle",center:{x:0,y:0},radius:20}]});
const solid=await makeshift.extrude({sources:s.profiles,distance:24,mode:"new"});
const hole=await makeshift.createSketch({plane:"XY",curves:[{kind:"circle",center:{x:0,y:0},radius:5}]});
await makeshift.extrude({sources:hole.profiles,distance:24,mode:"subtract",targets:[solid.bodies[0].id]});
`);
  const first = (await inspect(page)).document;
  if (Math.abs(first.bodies[0].volume - Math.PI * (400 - 25) * 24) > 1e-5)
    throw new Error("Fixture must be an annulus");
  await orient(page, [0.4, -1, 0.5]);
  const selection = await pick(page, [0, -20, 12]);
  assert.equal(selection.modelingSelection.length, 1);
  assert.equal(selection.modelingSelection[0].kind, "face");
  const faceId = selection.modelingSelection[0].face;
  const before = (await inspect(page)).document;
  const source = `
const selected=makeshift.selection;
if(selected.length!==1||selected[0].kind!=="face") throw new Error("Expected one selected face");
const target=selected[0];
const t=await makeshift.topology({body:target.body});
const f=t.faces.find(f=>f.id===target.face);
if(!f||f.surface.kind!=="cylinder") throw new Error("Expected cylindrical wall");
const rimIds=new Set(f.loops.flatMap(l=>l.edges.filter(e=>!e.seam).map(e=>e.edge)));
const rims=t.edges.filter(e=>rimIds.has(e.id)).map(e=>e.curve);
if(rims.length!==2||rims.some(r=>r.kind!=="circle")) throw new Error("Expected circular rims");
const circles=rims.filter(r=>r.kind==="circle").sort((a,b)=>a.center[2]-b.center[2]);
const height=circles[1].center[2]-circles[0].center[2];
await makeshift.replaceFace({body:target.body,face:target.face,surface:{kind:"cone",origin:circles[0].center,axis:[0,0,1],radius:18,semiAngle:Math.atan(4/height)*180/Math.PI}});
const result=await makeshift.topology({body:target.body});
if(result.faces.find(f=>f.id===target.face)?.surface.kind!=="cone") throw new Error("Missing cone");
`;
  await run(source);
  const accepted = (await inspect(page)).document;
  assert(Math.abs(accepted.bodies[0].volume - Math.PI * 24 * ((324 + 396 + 484) / 3 - 25)) < 1e-5);
  assert.equal(accepted.bodies[0].id, before.bodies[0].id);
  assert(accepted.bodies[0].faces.some((f) => f.id === faceId));
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await page.keyboard.press("Escape");
  const reselected = await pick(page, [0, -20, 12]);
  assert.equal(reselected.modelingSelection[0]?.face, faceId);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("2");
  await page.keyboard.press("Enter");
  assert(
    Math.abs(
      (await inspect(page)).document.bodies[0].center[0] - accepted.bodies[0].center[0] - 2,
    ) < 1e-6,
  );
  await chooseTool(page, "undo", "undo");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, accepted);
  await mkdir(".cache/agent-topology", { recursive: true });
  await page.screenshot({ path: `.cache/agent-topology/${name}.png` });
  const path = resolve(`.cache/agent-topology/${name}.makeshift`);
  await saveDocument(page, path);
  await openDocument(page, path);
  const reopened = (await inspect(page)).document.bodies[0];
  assert.equal(reopened.id, accepted.bodies[0].id);
  assert(Math.abs(reopened.volume - accepted.bodies[0].volume) < 1e-5);
  assert.deepEqual(
    reopened.faces.map((f) => f.id),
    accepted.bodies[0].faces.map((f) => f.id),
  );
  console.log(
    `PASS ${name}: pointer selected wall, typed topology→replacement→inspection, annular volume, one-step Undo/Redo, face reselection, manual body move, save/reopen`,
  );
} finally {
  if (app) {
    await page.evaluate(() => window.makeshiftAgent.request({ kind: "stop" })).catch(() => {});
    await app.close();
  }
  await web?.close();
}
async function run(source) {
  const prefix = `topology-${++counter}`;
  await writeFile(join(workspace, `${prefix}.ts`), source);
  if (web) {
    try {
      await promisify(execFile)(web.env.MAKESHIFT_CLI, ["run", `${prefix}.ts`], {
        cwd: workspace,
        env: web.env,
        timeout: 30000,
      });
    } catch (error) {
      throw new Error(error.stderr || error.message);
    }
  } else {
    await page.locator(".agent-screen textarea").focus();
    await page.keyboard.type(
      `makeshift run ${prefix}.ts > ${prefix}.json 2> ${prefix}.err; printf '%s' "$?" > ${prefix}.done`,
    );
    await page.keyboard.press("Enter");
    let exit;
    for (let i = 0; i < 1000; i++) {
      try {
        exit = await readFile(join(workspace, `${prefix}.done`), "utf8");
      } catch {}
      if (exit) break;
      await new Promise((r) => setTimeout(r, 30));
    }
    assert(exit, "CLI timed out");
    if (exit !== "0") throw new Error(await readFile(join(workspace, `${prefix}.err`), "utf8"));
  }
  await page.waitForFunction(() => !document.querySelector(".calculation-progress:not([hidden])"));
  await settled(page);
}
