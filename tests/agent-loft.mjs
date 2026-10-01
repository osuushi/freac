import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { scriptBrowser } from "./agent-script-browser.mjs";
import { inspect, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const source = `
const sections = [];
for (const [z,radius] of [[0,5],[10,3]]) {
  const sketch = await freac.createSketch({plane:{origin:[0,0,z],u:[1,0,0],v:[0,1,0]},curves:[{kind:"circle",center:{x:0,y:0},radius}]});
  sections.push(sketch.profiles[0]);
}
await freac.loft({sources:sections,ruled:true,mode:"new"});
`;
for (const name of ["chromium", "webkit"]) {
  const web = await scriptBrowser(name);
  try {
    const before = (await inspect(web.page)).document;
    await writeFile(join(web.workspace, "loft.ts"), source);
    await promisify(execFile)(web.env.FREAC_CLI, ["run", "loft.ts"], {
      cwd: web.workspace,
      env: web.env,
      timeout: 30000,
    });
    await settled(web.page);
    const accepted = (await inspect(web.page)).document;
    assert.equal(accepted.bodies.length, 1);
    assert.ok(Math.abs(accepted.bodies[0].volume - ((Math.PI * 10) / 3) * (25 + 15 + 9)) < 1e-5);
    await chooseTool(web.page, "undo", "undo");
    assert.deepEqual((await inspect(web.page)).document, before);
    await chooseTool(web.page, "redo", "redo");
    assert.deepEqual((await inspect(web.page)).document, accepted);
    await writeFile(
      join(web.workspace, "bad-loft.ts"),
      source.replace("ruled:true", "ruled:true,alignment:[0,0.5]"),
    );
    await assert.rejects(
      promisify(execFile)(web.env.FREAC_CLI, ["run", "bad-loft.ts"], {
        cwd: web.workspace,
        env: web.env,
        timeout: 30000,
      }),
      /alignment/,
    );
    await settled(web.page);
    assert.deepEqual((await inspect(web.page)).document, accepted);
    console.log(
      `${name}: typed freac.loft CLI/compiler/worker, exact geometry, atomic Undo/Redo and rollback passed`,
    );
  } finally {
    await web.close();
  }
}
