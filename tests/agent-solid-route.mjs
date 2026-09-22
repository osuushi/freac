import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { saveDocument } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export const solidScript = `
async function box(x:number) {
  const points=[{x,y:0},{x:x+20,y:0},{x:x+20,y:20},{x,y:20}];
  const s=await freac.createSketch({plane:"XY",curves:points.map((a,i)=>({kind:"segment",a,b:points[(i+1)%4]}))});
  return (await freac.extrude({sources:s.profiles,distance:10,mode:"new"})).bodies.at(-1)!;
}
const a=await box(0);
const rounded=await freac.finishEdges({edges:a.edges.map(edge=>({body:a.id,edge})),mode:"fillet",size:1});
const hollow=await freac.shell({selection:[{body:rounded.bodies[0].id,faces:[]}],thickness:-0.5});
if(hollow.bodies[0].volume>=1000) throw new Error("Expected hollow wall");
const b=await box(30);
const beveled=await freac.finishEdges({edges:b.edges.map(edge=>({body:b.id,edge})),mode:"chamfer",size:0.5});
const c=await box(40);
const joined=await freac.booleanBodies({ids:[b.id,c.id],mode:"union",keepOriginals:false});
if(joined.bodies.length!==2) throw new Error("Expected shell and union bodies");
`;
export async function agentSolidRoute(page, run, name) {
  const original = (await inspect(page)).document;
  await run(solidScript);
  const accepted = (await inspect(page)).document;
  assert.equal(accepted.bodies.length, 2);
  assert.ok(accepted.bodies[0].volume > 0 && accepted.bodies[0].volume < 1000);
  assert.ok(accepted.bodies[1].volume > 5500 && accepted.bodies[1].volume < 6000);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await orient(page, [1, -2, 1]);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "move", "move");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("2");
  await page.keyboard.press("Enter");
  assert.ok(
    Math.abs(
      (await inspect(page)).document.bodies[0].center[0] - accepted.bodies[0].center[0] - 2,
    ) < 1e-6,
  );
  await chooseTool(page, "undo", "undo");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, accepted);
  await mkdir(".cache/agent-solid-tools", { recursive: true });
  await page.screenshot({ path: `.cache/agent-solid-tools/${name}.png` });
  const file = resolve(`.cache/agent-solid-tools/${name}.freac`);
  await saveDocument(page, file);
  await chooseTool(page, "undo", "undo");
  await assert.rejects(
    () => run(`${solidScript}\nthrow new Error("solid rollback");`),
    /solid rollback/,
  );
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await chooseTool(page, "undo", "undo");
  console.log(
    `PASS ${name}: CLI fillet, chamfer, Shell and Boolean, grouped history, rollback, manual movement and Save`,
  );
  return { file, accepted };
}
