import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scriptBrowser } from "./agent-script-browser.mjs";
import { inspect, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Founder fixture is intentionally local; pass a Capture fixture path explicitly.
const fixture = JSON.parse(await readFile(process.argv[2], "utf8")).snapshot;
const web = await scriptBrowser(process.env.FREAC_TEST_BROWSER ?? "chromium");
const { page, workspace } = web;
page.setDefaultTimeout(60000);
let child;
try {
  await page.evaluate(async (document) => {
    await fetch("/sketch-api", {
      method: "POST",
      body: JSON.stringify({ kind: "open", document }),
    });
  }, fixture.document);
  await page.reload();
  await settled(page);
  const before = (await inspect(page)).document;
  const body = fixture.modelingSelection[0].body;
  await writeFile(
    join(workspace, "long.ts"),
    `
const p = [{x:5.9,y:-0.5},{x:7,y:0},{x:5.9,y:0.5}];
const s = await freac.createSketch({plane:"XZ",curves:p.map((a,i)=>({kind:"segment",a,b:p[(i+1)%3]}))});
await freac.revolve({sources:s.profiles,axis:{origin:[0,0,0],direction:[0,0,1]},angle:6480,height:18,mode:"union",targets:[${JSON.stringify(body)}]});
`,
  );
  function run() {
    return new Promise((resolve, reject) => {
      child = execFile(
        web.env.FREAC_CLI,
        ["run", "long.ts"],
        { cwd: workspace, env: web.env, timeout: 120000 },
        (error, stdout, stderr) => {
          child = undefined;
          if (error) reject(new Error(stderr || error.message));
          else resolve(stdout);
        },
      );
    });
  }
  const start = performance.now();
  await run();
  await settled(page);
  const elapsed = performance.now() - start;
  assert(
    elapsed > 15000,
    `Expected captured calculation to exercise old reply timeout: ${elapsed}`,
  );
  const after = (await inspect(page)).document;
  assert(after.bodies[0].volume > before.bodies[0].volume);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  for (const cancel of ["button", "Escape", "signal"]) {
    const pending = run().then(
      () => {
        throw new Error("Cancelled script succeeded");
      },
      (error) => error,
    );
    await page.getByRole("button", { name: "Cancel script", exact: true }).waitFor();
    // Let compilation/sketch creation finish so cancellation meets the native sweep.
    await page.waitForTimeout(3000);
    const cancelledAt = performance.now();
    if (cancel === "button")
      await page.getByRole("button", { name: "Cancel script", exact: true }).click();
    else if (cancel === "Escape") {
      await page
        .locator("canvas")
        .first()
        .click({ position: { x: 20, y: 20 } });
      await page.keyboard.press("Escape");
    } else child.kill("SIGINT");
    const error = await pending;
    assert.match(error.message, /cancel|interrupt/i);
    assert(performance.now() - cancelledAt < 4000, "Cancellation waited for geometry");
    await settled(page);
    assert.deepEqual((await inspect(page)).document, before);
  }
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
  console.log(
    `Long CLI calculation passed (${(elapsed / 1000).toFixed(1)}s), native cancellation and Undo/Redo passed`,
  );
} finally {
  child?.kill("SIGINT");
  await web.close();
}
