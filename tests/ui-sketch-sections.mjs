import assert from "node:assert/strict";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function hollowCylinder(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [10, 0]);
  await page.keyboard.press("c");
  await drag(page, [0, 0], [6, 0]);
  assert.deepEqual(
    (await inspect(page)).document.sketches[0].curves.map((c) => c.radius).sort((a, b) => a - b),
    [6, 10],
  );
  assert.equal((await inspect(page)).tool, "circle", "drawing keeps its tool within the session");
  const ring = await at(page, 7, 0);
  await chooseTool(page, "return to modeling", "modeling");
  assert.equal((await inspect(page)).tool, "select", "leaving clears the previous drawing tool");
  await page.mouse.click(ring.x, ring.y);
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("20");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  const state = await inspect(page);
  assert.equal(state.document.bodies.length, 1);
  return state.document.bodies[0];
}

export async function sketchSectionsRoute(page, name) {
  const originalBody = await hollowCylinder(page);
  let state;
  await chooseTool(page, "Sketch on XZ", "sketch-xz");
  assert.equal((await inspect(page)).tool, "select", "plane entry starts in Select");
  const right = await at(page, 7, 10),
    hole = await at(page, 0, 10);
  await page.waitForFunction(
    () =>
      !document
        .querySelector('[role="status"]')
        ?.textContent.includes("Calculating cross sections"),
  );
  await page.mouse.move(hole.x, hole.y);
  await page.mouse.click(hole.x, hole.y);
  state = await inspect(page);
  assert.equal(state.document.sketches.length, 1, "empty material cannot be copied");
  await chooseTool(page, "hide bodies", "hide-bodies");
  await page.mouse.move(right.x, right.y);
  await page.mouse.click(right.x, right.y);
  assert.equal(
    (await inspect(page)).document.sketches.length,
    1,
    "hidden bodies have no section targets",
  );
  await chooseTool(page, "show bodies", "show-bodies");
  await page.waitForFunction(
    () =>
      !document
        .querySelector('[role="status"]')
        ?.textContent.includes("Calculating cross sections"),
  );
  await page.mouse.move(right.x, right.y);
  await page.waitForFunction(() => document.querySelector("canvas").style.cursor === "pointer");
  await page.screenshot({ path: `.cache/sketch-review/${name}-section-hover.png` });
  await page.mouse.click(right.x, right.y);
  state = await inspect(page);
  assert.equal(state.document.sketches.length, 2);
  const copied = state.document.sketches[1];
  assert.equal(copied.curves.length, 4, "only the clicked disconnected region is copied");
  assert.ok(copied.curves.every((c) => c.kind === "segment"));
  assert.ok(
    copied.curves.every((c) => [c.a.x, c.b.x].every((x) => x >= 6 - 1e-6 && x <= 10 + 1e-6)),
  );
  assert.deepEqual(state.document.bodies[0], originalBody);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.sketches.length, 1);
  await chooseTool(page, "redo", "redo");
  assert.equal((await inspect(page)).document.sketches[1].curves.length, 4);
  // Reselect a copied edge and move it through the standard Select drag route.
  await page.keyboard.press("v");
  const edge = await at(page, 7, 20);
  await page.mouse.click(edge.x, edge.y);
  await inspect(page);
  // Grid snapping has its own toggle; Shift bypasses geometry attachments.
  await chooseTool(page, "toggle grid snapping", "grid");
  await drag(page, [7, 20], [7, 23], ["Shift"]);
  state = await inspect(page);
  assert.ok(
    state.document.sketches[1].curves.some((c) => c.a.y > 22.9 || c.b.y > 22.9),
    JSON.stringify(state.document.sketches[1].curves),
  );
  assert.deepEqual(state.document.bodies[0], originalBody);
  await page.screenshot({ path: `.cache/sketch-review/${name}-section-edited.png` });
}
