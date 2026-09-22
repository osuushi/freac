import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { inspect, reset } from "./ui-helpers.mjs";

export async function bodyArchiveRoute(page, name) {
  await page.keyboard.press("Escape");
  const bodies = (await inspect(page)).document.bodies;
  const path = resolve(`.cache/sketch-review/${name}-moved-bodies.freac`);
  await saveDocument(page, path);
  await reset(page);
  await openDocument(page, path);
  await page.waitForFunction(
    (count) => window.freacInspect().document.bodies?.length === count,
    bodies.length,
  );
  const loaded = (await inspect(page)).document.bodies;
  assert.deepEqual(
    loaded.map((b) => b.id),
    bodies.map((b) => b.id),
  );
  for (let i = 0; i < bodies.length; i++) {
    assert.deepEqual(
      loaded[i].faces.map((f) => f.id),
      bodies[i].faces.map((f) => f.id),
    );
    assert.deepEqual(
      loaded[i].edges.map((f) => f.id),
      bodies[i].edges.map((f) => f.id),
    );
    for (let axis = 0; axis < 3; axis++)
      assert.ok(Math.abs(loaded[i].center[axis] - bodies[i].center[axis]) < 1e-8);
  }
  console.log(`${name}: transformed bodies retain placement and topology through actual Save/Open`);
}
