import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { scriptBrowser } from "./agent-script-browser.mjs";
import { inspect, settled } from "./ui-helpers.mjs";
import { orient, pick } from "./ui-measurement.mjs";
import { chooseTool } from "./ui-tools.mjs";

const web = await scriptBrowser(process.env.FREAC_TEST_BROWSER ?? "chromium");
let count = 0;
try {
  const { page, workspace, env } = web;
  await settled(page);
  const run = async (source) => {
    const name = `move-face-${++count}.ts`;
    await writeFile(join(workspace, name), source);
    const { stdout } = await promisify(execFile)(env.FREAC_CLI, ["run", name], {
      cwd: workspace,
      env,
      timeout: 30000,
    });
    await settled(page);
    return JSON.parse(stdout);
  };
  await run(`const p=[{x:-10,y:-10},{x:10,y:-10},{x:10,y:10},{x:-10,y:10}];
const s=await freac.createSketch({plane:"XY",curves:p.map((a,i)=>({kind:"segment",a,b:p[(i+1)%4]}))});
await freac.extrude({sources:s.profiles,distance:10,mode:"new"});`);
  const original = (await inspect(page)).document;
  assert(Math.abs(original.bodies[0].volume - 4000) < 1e-6);
  await orient(page, [0.4, -1, 0.7]);
  const selected = await pick(page, [-5, -10, 4]);
  assert.equal(selected.modelingSelection[0]?.kind, "face");
  await run(`const faces=freac.selection.filter(t=>t.kind==="face");
if(faces.length!==1) throw new Error("Expected one face");
await freac.moveFaces({faces,translation:[0,-1,0],pivot:[0,0,0],axis:[0,0,1],angle:0});`);
  const moved = (await inspect(page)).document;
  assert(Math.abs(moved.bodies[0].volume - 4200) < 1e-6);
  assert.deepEqual(
    moved.bodies[0].faces.map((face) => face.id).sort(),
    original.bodies[0].faces.map((face) => face.id).sort(),
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  console.log("PASS agent CLI moves a pointer-selected face and Undo restores the body");
} finally {
  await web.close();
}
