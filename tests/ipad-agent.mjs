import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inspect, settled } from "./ui-helpers.mjs";

export async function tabletAgentRoute(page) {
  await page.evaluate(() =>
    window.freacAgent.request({
      kind: "configure",
      preferences: {
        preset: "custom",
        executable: "/bin/sh",
        args: ["-i"],
        env: {},
      },
    }),
  );
  await page.getByRole("button", { name: "Open agent terminal", exact: true }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  const workspace = (await page.evaluate(() => window.freacAgent.request({ kind: "read" })))
    .workspace;
  const run = async (command, name) => {
    await page.locator(".agent-screen textarea").focus();
    await page.keyboard.type(
      `${command} > ${name}.json 2> ${name}.err; printf '%s' "$?" > ${name}.done`,
    );
    await page.keyboard.press("Enter");
    let exit;
    for (let i = 0; i < 600; i++) {
      exit = await readFile(join(workspace, `${name}.done`), "utf8").catch(() => "");
      if (exit) break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.equal(
      exit,
      "0",
      await readFile(join(workspace, `${name}.err`), "utf8").catch(() => "No CLI result"),
    );
    return readFile(join(workspace, `${name}.json`), "utf8");
  };
  const state = await inspect(page);
  const overview = JSON.parse(await run("freac inspect", "inspect-ipad"));
  assert.equal(overview.sketches.length, state.document.sketches.length);
  const render = JSON.parse(await run("freac render", "render-ipad"));
  assert.equal((await readFile(render.path)).subarray(1, 4).toString(), "PNG");
  await writeFile(
    join(workspace, "ipad-script.ts"),
    'await freac.createSketch({ plane:"XZ", curves:[{kind:"segment",a:{x:0,y:0},b:{x:10,y:10}}] });\n',
  );
  await run("freac run ipad-script.ts", "script-ipad");
  await settled(page);
  assert.equal((await inspect(page)).document.sketches.length, state.document.sketches.length + 1);
  await page.getByLabel("Modeling viewport", { exact: true }).focus();
  await page.keyboard.press("Meta+z");
  await settled(page);
  assert.deepEqual((await inspect(page)).document, state.document);
  const output = await run("printf '%s' '~`'", "literal-keys");
  assert.equal(output, "~`");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page
    .locator(".agent-status")
    .filter({ hasText: /Stopped|Exited/ })
    .waitFor();
  await page.getByRole("button", { name: "Collapse agent terminal", exact: true }).click();
  console.log("agent terminal, inspection/render, script and Undo passed over iPad transport");
}
