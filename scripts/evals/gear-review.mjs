// Reopen an evaluated model and exercise ordinary selection/settings/Undo controls.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { launchElectron, openDocument } from "../../tests/native-documents.mjs";
import { orient, project } from "../../tests/ui-blend-edit.mjs";
import { worldClick } from "../../tests/ui-face-offset.mjs";
import { inspect } from "../../tests/ui-helpers.mjs";
import { chooseTool } from "../../tests/ui-tools.mjs";
import { cases } from "./gear-cases.mjs";
import { gradeTrain } from "./gear-grade.mjs";

async function checkReopened(document, directory) {
  const saved = JSON.parse(await readFile(join(directory, "document.json"), "utf8"));
  const metadata = JSON.parse(await readFile(join(directory, "metadata.json"), "utf8"));
  assert.deepEqual(document.decorators, saved.decorators);
  assert.deepEqual(
    document.bodies.map((b) => b.id),
    saved.bodies.map((b) => b.id),
  );
  for (const body of document.bodies) {
    const old = saved.bodies.find((b) => b.id === body.id);
    assert.deepEqual(
      body.faces.map((f) => f.id),
      old.faces.map((f) => f.id),
    );
    assert(Math.abs(body.volume - old.volume) < 1e-8 * old.volume);
    assert(body.bounds.every((v, i) => Math.abs(v - old.bounds[i]) < 1e-7));
  }
  // Open retessellates native BReps; compare metrology and the actual mechanism,
  // not byte-identical BRep serialization or triangulation ordering.
  assert.deepEqual((await gradeTrain(document, cases[metadata.name])).failures, []);
}

async function frame(page, document) {
  await orient(page, [0, -1, 0.4]);
  const bounds = document.bodies.map((b) => b.bounds);
  const lo = [0, 1, 2].map((i) => Math.min(...bounds.map((b) => b[i])));
  const hi = [0, 1, 2].map((i) => Math.max(...bounds.map((b) => b[i + 3])));
  const desired = Math.max(...hi.map((v, i) => v - lo[i])) * 1.5;
  const box = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const state = await inspect(page);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, Math.log(desired / state.camera.height) / 0.01);
  await page.keyboard.up("Control");
  await page.waitForFunction(
    (h) => Math.abs(window.freacInspect().camera.height - h) < 0.001,
    desired,
  );
  const center = await project(
    page,
    lo.map((v, i) => (v + hi[i]) / 2),
  );
  await page.mouse.wheel(center.x - box.x - box.width / 2, center.y - box.y - box.height / 2);
  await inspect(page);
}

for (const directory of process.argv.slice(2)) {
  const app = await launchElectron({
    args: ["."],
    env: { ...process.env, FREAC_TEST_HIDDEN: "1" },
  });
  try {
    const page = await app.firstWindow();
    await inspect(page);
    await openDocument(page, resolve(directory, "model.freac"));
    const original = (await inspect(page)).document;
    await checkReopened(original, directory);
    await frame(page, original);
    const d = original.decorators[0];
    const body = original.bodies.find((b) => b.id === d.faces[0].body);
    const face = body.faces.find((f) => f.id === d.faces[0].face);
    const c = face.cylinder;
    await worldClick(page, [
      c.origin[0],
      c.origin[1] - c.radius,
      (body.bounds[2] + body.bounds[5]) / 2,
    ]);
    await chooseTool(page, "gear", "gear");
    const phase = page.getByRole("spinbutton", { name: "Tooth phase", exact: true });
    const old = Number(await phase.inputValue());
    await phase.fill(String(old + 0.1));
    await phase.press("Enter");
    const edited = (await inspect(page)).document;
    assert.notDeepEqual(edited, original);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, edited);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
    await page.keyboard.press("Escape");
    await page.screenshot({ path: join(directory, "review.png") });
    await writeFile(
      join(directory, "ui-review.json"),
      JSON.stringify(
        { reopened: true, pointerReselection: true, phaseEdit: true, undoRedo: true },
        null,
        2,
      ),
    );
    console.log(`PASS model reopen, pointer selection, phase edit and Undo/Redo: ${directory}`);
  } finally {
    await app.close();
  }
}
