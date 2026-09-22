import assert from "node:assert/strict";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export const modelingScript = `
const plane = await freac.constructionPlane({frame:{origin:[0,0,0],u:[1,0,0],v:[0,1,0]}});
const s = await freac.createSketch({plane:plane.frame,curves:[{kind:"circle",center:{x:0,y:0},radius:2}]});
const scaled = await freac.scale({kind:"curves",sketchId:s.sketch,ids:s.curves,pivot:[0,0,0],factor:2});
const solid = await freac.extrude({sources:scaled.sketches.find(x=>x.sketch===s.sketch)!.profiles,distance:8,symmetric:true,mode:"new"});
const grown = await freac.scale({kind:"solids",ids:[solid.bodies[0].id],faces:[],edges:[],pivot:[0,0,0],factor:2});
const frame: {origin:[number,number,number];u:[number,number,number];v:[number,number,number]} = {origin:[0,0,2],u:[1,0,0],v:[0,1,0]};
const marked = await freac.imprint({targets:grown.bodies.map(b=>({body:b.id,faces:b.faces})),frame});
if(marked.bodies[0].faces.length<=grown.bodies[0].faces.length) throw new Error("No imprint edges");
const split = await freac.splitBody({targets:marked.bodies.map(b=>({body:b.id})),frame});
if(split.bodies.length!==2) throw new Error("Expected two halves");
await freac.scale({kind:"sketches",ids:[s.sketch],pivot:[0,0,0],factor:0.5});
await freac.constructionPlane({id:plane.plane,frame:{origin:[0,0,2],u:[1,0,0],v:[0,1,0]}});
const extra = await freac.constructionPlane({frame});
await freac.deleteConstructionPlane({id:extra.plane});
`;
export async function agentModelingRoute(page, run) {
  const original = (await inspect(page)).document;
  await run(modelingScript);
  const accepted = (await inspect(page)).document;
  assert.equal(accepted.constructionPlanes.length, 1);
  assert.deepEqual(accepted.constructionPlanes[0].frame.origin, [0, 0, 2]);
  assert.equal(accepted.bodies.length, 2);
  assert.ok(
    Math.abs(accepted.bodies.reduce((sum, b) => sum + b.volume, 0) - 1024 * Math.PI) < 1e-5,
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await chooseTool(page, "undo", "undo");
  await assert.rejects(
    () => run(`${modelingScript}\nthrow new Error("rollback modeling");`),
    /rollback modeling/,
  );
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await chooseTool(page, "undo", "undo");
  console.log(
    "PASS agent planes, curve/sketch/body scale, symmetric extrusion, imprint/split, grouped history and rollback",
  );
}
