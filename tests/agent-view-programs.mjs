import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inspect } from "./ui-helpers.mjs";

export async function checkViewPrograms({ page, workspace, query, unchanged, cylinders }) {
  const stable = await unchanged();
  await writeFile(
    join(workspace, "filter.ts"),
    'const faces = await makeshift.faces(); await makeshift.select(faces.filter(f => f.surface === "cylinder" && f.cylinder.radius < 5).map(f => f.id));',
  );
  assert.deepEqual((await query("view", "filter.ts")).result.context.selection, cylinders);
  assert.deepEqual(await unchanged(), stable);
  await writeFile(join(workspace, "invalid.ts"), 'await makeshift.select(["missing-id"]);');
  await assert.rejects(() => query("view", "invalid.ts"), /Unknown geometry ID/);
  assert.deepEqual(await unchanged(), stable);
  await writeFile(
    join(workspace, "type-error.ts"),
    'await makeshift.createSketch({plane:"XY", curves:[]});',
  );
  await assert.rejects(() => query("view", "type-error.ts"), /typecheck failed/);
  assert.deepEqual(await unchanged(), stable);
  await writeFile(
    join(workspace, "empty.ts"),
    'const faces = await makeshift.faces(); await makeshift.select(faces.filter(f => f.surface === "cylinder" && f.cylinder.radius < 0).map(f => f.id));',
  );
  assert.deepEqual((await query("view", "empty.ts")).result.context.selection, []);
  await writeFile(
    join(workspace, "failure.ts"),
    'const faces = await makeshift.faces(); await makeshift.select(faces.filter(f => f.surface === "cylinder").map(f => f.id)); throw new Error("after selection");',
  );
  await assert.rejects(() => query("view", "failure.ts"), /after selection/);
  assert.deepEqual((await inspect(page)).modelingSelection, cylinders);
  assert.deepEqual((await inspect(page)).document, stable.document);
  const history = await page.evaluate(() => window.makeshiftHistory());
  assert.deepEqual(history.slice(0, stable.history.length), stable.history);
  assert.deepEqual(
    history.slice(stable.history.length).map((e) => e.operation.kind),
    ["selection", "selection"],
  );
}
