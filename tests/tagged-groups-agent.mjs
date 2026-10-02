import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { launchElectron } from "./native-documents.mjs";
import { inspect, settled } from "./ui-helpers.mjs";

const app = await launchElectron({
  args: ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
});
let page;
try {
  page = await app.firstWindow();
  await settled(page);
  assert.equal(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    false,
  );
  await page.evaluate(() =>
    window.makeshiftAgent.request({
      kind: "configure",
      preferences: { preset: "custom", executable: "/bin/sh", args: ["-i"], env: {} },
    }),
  );
  await page.getByRole("button", { name: "Open agent terminal" }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  const workspace = (await page.evaluate(() => window.makeshiftAgent.request({ kind: "read" })))
    .workspace;
  await writeFile(
    join(workspace, "tags.ts"),
    `
const s = await makeshift.createSketch({plane:"XY",curves:[{kind:"circle",center:{x:0,y:0},radius:5}]});
const result = await makeshift.extrude({sources:s.profiles, distance:10, mode:"new"});
const body = result.bodies[0];
const topology = await makeshift.topology({body:body.id});
const top = topology.faces.find(f=>f.surface.kind === "plane" && Math.abs(f.surface.origin[2]-10)<1e-6);
if (!top) throw new Error("Missing cap");
const groups = await makeshift.editTaggedGroup({action:"create",body:body.id,name:"Cap",description:"Height reference",members:[{kind:"face",id:top.id}]});
const group = groups.find(g=>g.name==="Cap");
if (!group) throw new Error("Missing group");
await makeshift.applyTaggedGroup({id:group.id,operation:{kind:"offsetFaces",distance:2}});
await makeshift.editTaggedGroup({action:"update",id:group.id,name:"Top reference"});
const current = await makeshift.taggedGroups();
if (current.length!==1 || current[0].name!=="Top reference" || current[0].members.length!==1) throw new Error("Group did not continue");
`,
  );
  await command("makeshift run tags.ts", "script");
  const state = await inspect(page),
    group = state.document.taggedGroups[0];
  assert.ok(Math.abs(state.document.bodies[0].volume - Math.PI * 25 * 12) < 1e-5);
  await command("makeshift inspect", "overview");
  assert.equal(
    JSON.parse(await readFile(join(workspace, "overview.json"), "utf8")).taggedGroups[0].id,
    group.id,
  );
  await command(`makeshift inspect ${group.id}`, "inspect");
  const inspected = JSON.parse(await readFile(join(workspace, "inspect.json"), "utf8"));
  assert.equal(inspected.targets[0].geometry.name, "Top reference");
  await command(`makeshift select ${group.id} ${group.members[0].id}`, "select");
  assert.equal((await inspect(page)).modelingSelection.length, 1);
  assert.equal((await inspect(page)).modelingSelection[0].face, group.members[0].id);
  await writeFile(
    join(workspace, "remove.ts"),
    `const groups=await makeshift.taggedGroups(); await makeshift.editTaggedGroup({action:"remove",id:groups[0].id});`,
  );
  await command("makeshift run remove.ts", "remove");
  assert.equal((await inspect(page)).document.taggedGroups.length, 0);
  assert.equal((await inspect(page)).document.bodies.length, 1);
  console.log(
    "hidden Electron: typed CLI create/list/update/direct offset, overview/ID inspection, group selection and removal pass",
  );
  async function command(source, prefix) {
    await page.locator(".agent-screen textarea").focus();
    await page.keyboard.type(
      `${source} > ${prefix}.json 2> ${prefix}.err; printf '%s' "$?" > ${prefix}.done`,
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
    assert.ok(exit, "CLI timed out");
    assert.equal(exit, "0", await readFile(join(workspace, `${prefix}.err`), "utf8"));
    await settled(page);
  }
} finally {
  await page?.evaluate(() => window.makeshiftAgent.request({ kind: "stop" })).catch(() => {});
  await app.close();
}
