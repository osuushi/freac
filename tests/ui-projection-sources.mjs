import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function projectionSourcesRoute(page, name) {
  const fixture = JSON.parse(await readFile("tests/fixtures/projection-tilted-plane.json", "utf8"));
  await reset(page);
  await openDocument(page, {
    name: "projection-tilted-plane.freac",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "freac", version: 1, document: fixture.document }),
    ),
  });
  await orient(page, [1, -2, 1]);
  const original = (await inspect(page)).document;
  await chooseTool(page, "Project", "project");
  const region = await project(page, [5, 3, 0]);
  await page.mouse.move(region.x, region.y);
  let state = await inspect(page);
  assert.equal(
    state.modelingHover,
    "profile",
    "A filled region hovers before any source is selected",
  );
  assert.equal(state.modelingSelection.length, 0);
  await page.screenshot({ path: `.cache/sketch-review/${name}-projection-region-hover.png` });
  await page.mouse.click(region.x, region.y);
  state = await inspect(page);
  assert.equal(state.modelingSelection[0]?.kind, "profile");
  const sourceMode = page.getByRole("button", { name: "Project along source normal", exact: true });
  const targetMode = page.getByRole("button", { name: "Project along target normal", exact: true });
  assert.equal(await sourceMode.isEnabled(), true);
  await page.getByRole("button", { name: "Use Plane 1", exact: true }).click();
  await inspect(page);
  await sourceMode.click();
  state = await inspect(page);
  assertEllipse(state.preview.sketches[1], 0, 40 / Math.sqrt(3));
  assert.deepEqual(state.document, original);
  await targetMode.click();
  assertEllipse((await inspect(page)).preview.sketches[1], 13, 10 * Math.sqrt(3));
  const sketchRow = page.getByRole("button", { name: "Select Sketch 1", exact: true });
  assert.equal(await sketchRow.isEnabled(), true);
  await sketchRow.click();
  assert.ok((await inspect(page)).modelingSelection.some((t) => t.kind === "sketch"));
  await sketchRow.click();
  assert.equal((await inspect(page)).modelingSelection.length, 1);
  await sourceMode.click();
  await inspect(page);
  await page.getByRole("button", { name: "Accept projection", exact: true }).click();
  state = await inspect(page);
  assert.equal(state.document.sketches.length, 2);
  assertEllipse(state.document.sketches[1], 0, 40 / Math.sqrt(3));
  const accepted = state.document;
  await chooseTool(page, "Undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "Redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await cylinderSources(page, name);
  console.log(
    `${name}: source hover, region selection, normal toggle, Entities sources, body silhouettes and source fill passed`,
  );
}

function assertEllipse(sketch, center, rx) {
  assert.ok(sketch.curves.length > 1 && sketch.curves.every((c) => c.kind === "bezier"));
  for (const c of sketch.curves)
    for (let i = 0; i <= 60; i++) {
      const t = i / 60,
        s = 1 - t;
      const p = (key) =>
        s ** 3 * c.a[key] +
        3 * s ** 2 * t * c.c1[key] +
        3 * s * t ** 2 * c.c2[key] +
        t ** 3 * c.b[key];
      assert.ok(
        Math.abs(Math.hypot((p("x") - center) / rx, p("y") / 20) - 1) < 0.001 / Math.min(rx, 20),
      );
    }
}

async function cylinderSources(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [10, 0]);
  const center = await at(page, 3, 3);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await page.keyboard.press("Delete");
  await orient(page, [1, -2, 1]);
  await chooseTool(page, "Project", "project");
  const top = await project(page, [3, 3, 10]);
  await page.mouse.move(top.x, top.y);
  let state = await inspect(page);
  assert.equal(state.modelingHover, "face");
  assert.ok(state.bodyRendering.faces.some((f) => f.color === "ead3aa"));
  await page.mouse.click(top.x, top.y);
  state = await inspect(page);
  const face = state.modelingSelection[0];
  assert.equal(face?.kind, "face");
  assert.equal(state.bodyRendering.faces.find((f) => f.face === face.face).color, "82b5e0");
  assert.equal(
    await page
      .getByRole("button", { name: "Project along source normal", exact: true })
      .isEnabled(),
    true,
  );
  await page.keyboard.press("Escape");
  await chooseTool(page, "Project", "project");
  const bodyRow = page.getByRole("button", { name: "Select Body 1", exact: true });
  await bodyRow.hover();
  state = await inspect(page);
  assert.ok(state.bodyRendering.faces.every((f) => f.color === "ead3aa"));
  await bodyRow.click();
  state = await inspect(page);
  assert.equal(state.modelingSelection[0]?.kind, "body");
  assert.ok(state.bodyRendering.faces.every((f) => f.color === "82b5e0"));
  assert.equal(
    await page
      .getByRole("button", { name: "Project along source normal", exact: true })
      .isEnabled(),
    false,
  );
  const before = state.document;
  await pickPlane(page, "XZ");
  state = await inspect(page);
  const outline = state.preview.sketches[0];
  assert.equal(outline.curves.length, 4, "The projected cylinder has both rims and both sides");
  assert.ok(outline.curves.every((c) => c.kind === "segment"));
  const sides = outline.curves.filter((c) => Math.abs(c.a.x - c.b.x) < 1e-7);
  assert.equal(sides.length, 2);
  for (const side of sides) assert.ok(Math.abs(Math.abs(side.a.x) - 10) < 1e-7);
  await page.screenshot({ path: `.cache/sketch-review/${name}-projection-cylinder-bounds.png` });
  await page.keyboard.press("Enter");
  const accepted = (await inspect(page)).document;
  await chooseTool(page, "Undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "Redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await editCylinderCopy(page, name, accepted);
}

async function editCylinderCopy(page, name, accepted) {
  const corner = await at(page, 10, 10);
  const moved = await at(page, 12, 12);
  await page.mouse.move(corner.x, corner.y);
  await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(moved.x, moved.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  const edited = (await inspect(page)).document;
  assert.notDeepEqual(edited.sketches[0].curves, accepted.sketches[0].curves);
  assert.deepEqual(edited.bodies, accepted.bodies);
  await chooseTool(page, "Undo", "undo");
  assert.deepEqual((await inspect(page)).document, accepted);
  const path = resolve(`.cache/sketch-review/${name}-cylinder-projection.freac`);
  await saveDocument(page, path);
  await reset(page);
  await openDocument(page, path);
  const reopened = (await inspect(page)).document;
  assert.deepEqual(reopened.sketches, accepted.sketches);
  assert.deepEqual(reopened.entityPresentation, accepted.entityPresentation);
  assert.deepEqual(
    reopened.bodies[0].faces.map((f) => f.id),
    accepted.bodies[0].faces.map((f) => f.id),
  );
  assert.ok(Math.abs(reopened.bodies[0].volume - 1000 * Math.PI) < 1e-6);
  for (const [i, value] of reopened.bodies[0].bounds.entries())
    assert.ok(Math.abs(value - accepted.bodies[0].bounds[i]) < 1e-7);
}
