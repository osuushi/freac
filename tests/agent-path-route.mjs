import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { saveDocument } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export const pathScript = `
const s = await freac.createSketch({plane:"XY",curves:[{kind:"circle",center:{x:0,y:0},radius:1}]});
const swept = await freac.sweep({sources:s.profiles,path:[{kind:"bezier",a:[0,0,0],c1:[0,0,10],c2:[10,0,20],b:[10,10,30]}],mode:"new"});
if(swept.bodies.length!==1 || swept.bodies[0].volume<90) throw new Error("Expected curved tube");
`;
export async function agentPathRoute(page, run, name) {
  const original = (await inspect(page)).document;
  await run(pathScript);
  const accepted = (await inspect(page)).document;
  assert.equal(accepted.bodies.length, 1);
  assert.equal(accepted.sketches.length, 1);
  assert.equal(accepted.constructionPlanes?.length ?? 0, 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await orient(page, [1, -2, 1]);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("3");
  await page.keyboard.press("Enter");
  assert.ok(
    Math.abs(
      (await inspect(page)).document.bodies[0].center[0] - accepted.bodies[0].center[0] - 3,
    ) < 1e-5,
  );
  await chooseTool(page, "undo", "undo");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, accepted);
  await mkdir(".cache/path-sweep", { recursive: true });
  await page.screenshot({ path: `.cache/path-sweep/${name}.png` });
  const file = resolve(`.cache/path-sweep/${name}.freac`);
  await saveDocument(page, file);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    `PASS ${name}: actual typed CLI nonplanar sweep, manual reselection/movement, grouped history and Save`,
  );
  return { file, accepted };
}
