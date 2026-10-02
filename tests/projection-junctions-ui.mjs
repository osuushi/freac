import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { at, inspect, reset } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const captured = JSON.parse(
  await readFile("tests/fixtures/projection-cylinder-junctions.json", "utf8"),
).document;
const frame = captured.sketches[1].plane;
const sides = captured.sketches[1].curves.filter((c) => c.kind === "segment");
const center = Object.fromEntries(
  ["x", "y"].map((key) => [key, sides.reduce((sum, c) => sum + c.a[key] + c.b[key], 0) / 4]),
);
const center3d = frame.origin.map((v, i) => v + frame.u[i] * center.x + frame.v[i] * center.y);
const normal = [
  frame.u[1] * frame.v[2] - frame.u[2] * frame.v[1],
  frame.u[2] * frame.v[0] - frame.u[0] * frame.v[2],
  frame.u[0] * frame.v[1] - frame.u[1] * frame.v[0],
];
const source = {
  ...captured,
  sketches: [captured.sketches[0]],
  constructionPlanes: [{ id: "captured-target", frame }],
};

await withUiRuntimes(async (page, name) => {
  await reset(page);
  await openDocument(page, {
    name: "cylinder-projection-source.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "makeshift", version: 1, document: source })),
  });
  await page.getByRole("button", { name: "Hide Sketch 1", exact: true }).click();
  const before = (await inspect(page)).document;
  await chooseTool(page, "Project", "project");
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.getByRole("button", { name: "Use Plane 1", exact: true }).click();
  await orient(page, normal);
  let state = await inspect(page);
  assert.ok(state.preview);
  assert.deepEqual(state.document, before);
  await page.screenshot({ path: `.cache/sketch-review/${name}-projection-junctions-preview.png` });
  await page.keyboard.press("Enter");
  state = await inspect(page);
  const accepted = state.document;
  await chooseTool(page, "Undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "Redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await editJunction(page, accepted);
  await chooseTool(page, "return to modeling", "modeling");
  await page.getByRole("button", { name: "Hide Body 1", exact: true }).click();
  await chooseMiddle(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-projection-junctions-filled.png` });
  await extrudeMiddle(page, accepted);
  const file = resolve(`.cache/sketch-review/${name}-projection-junctions.makeshift`);
  await saveDocument(page, file);
  await reset(page);
  await openDocument(page, file);
  assert.deepEqual((await inspect(page)).document.sketches, accepted.sketches);
  await page.getByRole("button", { name: "Hide Sketch 1", exact: true }).click();
  await page.getByRole("button", { name: "Hide Body 1", exact: true }).click();
  await orient(page, normal);
  await chooseMiddle(page);
  console.log(
    `${name}: captured cylinder projection fills, selects and extrudes its middle region; Undo/Redo and archive passed`,
  );
});

async function chooseMiddle(page) {
  const point = await project(page, center3d);
  await page.mouse.move(point.x, point.y);
  await page.mouse.click(point.x, point.y);
  const state = await inspect(page);
  assert.equal(state.modelingSelection[0]?.kind, "profile");
  assert.ok(Math.abs(state.modelingSelection[0].area - 293.46) < 0.03);
}

async function editJunction(page, accepted) {
  await page.getByRole("button", { name: "Select Sketch 2", exact: true }).click();
  await page.keyboard.press("Enter");
  const side = accepted.sketches[1].curves.find((c) => c.kind === "segment");
  const start = await at(page, side.a.x, side.a.y);
  const end = await at(page, side.a.x + 1, side.a.y + 0.75);
  await page.mouse.move(start.x, start.y);
  // Shift-hover opens point inspection; bypass snaps after the pointer owns its drag.
  await page.mouse.down();
  await page.keyboard.down("Shift");
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  const state = await inspect(page);
  const edited = state.document;
  assert.ok(
    JSON.stringify(edited.sketches[1].curves) !== JSON.stringify(accepted.sketches[1].curves),
    "A normal point press starts movement at the fused side/rim junction",
  );
  assert.deepEqual(edited.bodies, accepted.bodies);
  await chooseTool(page, "Undo", "undo");
  assert.deepEqual((await inspect(page)).document, accepted);
}

async function extrudeMiddle(page, accepted) {
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("2");
  await page.keyboard.press("Enter");
  const state = await inspect(page);
  assert.ok(state.preview);
  assert.ok(Math.abs(state.preview.bodies.at(-1).volume - 586.92) < 0.06);
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).document.bodies.length, 2);
  await chooseTool(page, "Undo", "undo");
  assert.deepEqual((await inspect(page)).document, accepted);
}
