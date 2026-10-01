import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { inspect } from "./ui-helpers.mjs";
import { hold, releaseChoice } from "./ui-overlap-gesture.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await withUiRuntimes(async (page, name) => {
  const points = await plate(page);
  await chooseTool(page, "Tag geometry", "tag-geometry");
  await page.getByRole("textbox", { name: "Group name", exact: true }).fill("Mounting rim");
  await page
    .getByRole("textbox", { name: "Group description", exact: true })
    .fill("Reference edges for mounting");
  const before = (await inspect(page)).document;
  await page.getByRole("button", { name: "Done", exact: true }).click();
  let state = await inspect(page);
  assert.equal(state.document.taggedGroups.length, 1);
  assert.equal(state.document.taggedGroups[0].members.length, 2);
  assert.deepEqual(state.document.bodies, before.bodies);
  await rowAffordances(page, name);
  const row = page.getByRole("button", { name: "Select group Mounting rim", exact: true });
  await row.click();
  assert.equal((await inspect(page)).modelingSelection.length, 2);
  await keyboardEdit(page, row);
  await useGroup(page, row);
  await row.dblclick();

  assert.equal((await inspect(page)).interaction.kind, "tag-membership");
  await page.getByRole("textbox", { name: "Group name", exact: true }).fill("Cancelled");
  await page.mouse.click(points.center.x, points.center.y);
  assert.equal((await inspect(page)).modelingSelection[0].kind, "face");
  await page.mouse.move(points.left.x - 20, points.top.y - 20);
  await page.mouse.down();
  await page.mouse.move(points.center.x, points.center.y, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();

  assert.equal((await inspect(page)).document.taggedGroups[0].name, "Mounting rim");
  assert.equal((await inspect(page)).modelingSelection.length, 2);
  await row.dblclick();
  await page.getByRole("textbox", { name: "Group name", exact: true }).fill("Mounting surface");
  await page.mouse.click(points.center.x, points.center.y);
  await page.keyboard.down("Shift");
  await page.mouse.click(points.top.x, points.top.y);
  await page.keyboard.up("Shift");
  state = await inspect(page);
  assert.deepEqual(state.modelingSelection.map((t) => t.kind).sort(), ["edge", "face"]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-tag-edit.png` });
  await membershipSelection(page, points, before);
  await page.keyboard.press("Enter");
  state = await inspect(page);

  assert.equal(state.document.taggedGroups[0].name, "Mounting surface");
  assert.deepEqual(state.document.taggedGroups[0].members.map((m) => m.kind).sort(), [
    "edge",
    "face",
  ]);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.taggedGroups[0].name, "Mounting rim");
  await chooseTool(page, "redo", "redo");
  const saved = (await inspect(page)).document.taggedGroups;
  const directory = await mkdtemp(join(tmpdir(), "freac-tags-"));
  try {
    const path = join(directory, "tags.freac");
    await saveDocument(page, path);
    await openDocument(page, path);
    assert.deepEqual((await inspect(page)).document.taggedGroups, saved);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  const current = page.getByRole("button", { name: "Select group Mounting surface", exact: true });
  if (!(await current.isVisible()))
    await page.getByRole("button", { name: "Toggle tagged groups" }).click();
  await page.getByRole("button", { name: "Remove group Mounting surface", exact: true }).click();
  assert.equal((await inspect(page)).document.taggedGroups.length, 0);
  assert.equal((await inspect(page)).document.bodies.length, 1);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.taggedGroups, saved);
  console.log(
    `${name}: tag creation, child selection, modal edit/cancel, mixed membership, Undo/Redo, save/open and removal pass`,
  );
});

async function membershipSelection(page, points, before) {
  // Marquee selection stays inside the modal lease and selects only this body's topology.
  await page.mouse.move(points.left.x - 20, points.top.y - 20);
  await page.mouse.down();
  await page.mouse.move(
    points.center.x + (points.center.x - points.left.x) + 20,
    points.center.y + (points.center.y - points.top.y) + 20,
    { steps: 8 },
  );
  await page.mouse.up();
  assert.equal((await inspect(page)).interaction.kind, "tag-membership");
  assert.ok((await inspect(page)).modelingSelection.length > 0);
  await hold(page, points.center);
  const chooser = page.getByRole("dialog", { name: "Choose overlapping geometry" });
  await chooser.waitFor({ state: "visible" });
  assert.equal(await chooser.locator('[data-kind="body"], [data-kind="plane"]').count(), 0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(
    (await inspect(page)).interaction.kind,
    "tag-membership",
    "Escape dismisses overlap before the membership editor",
  );
  await hold(page, points.center);
  await releaseChoice(page, "Face");

  assert.equal((await inspect(page)).interaction.kind, "tag-membership");
  await page.keyboard.down("Shift");
  await page.mouse.click(points.top.x, points.top.y);
  await page.keyboard.up("Shift");
  const camera = (await inspect(page)).camera;
  await page.mouse.move(950, 700);
  await page.mouse.wheel(40, 20);
  assert.notDeepEqual(
    (await inspect(page)).camera,
    camera,
    "Navigation remains available in the modal editor",
  );
  assert.equal((await inspect(page)).interaction.kind, "tag-membership");
  await page.keyboard.press("Delete");

  assert.deepEqual(
    (await inspect(page)).document.bodies,
    before.bodies,
    "Modal Delete never deletes geometry",
  );
}

async function useGroup(page, row) {
  await row.click({ modifiers: ["Meta"] });
  assert.equal((await inspect(page)).modelingSelection.length, 0);
  await row.click({ modifiers: ["Shift"] });
  assert.equal((await inspect(page)).modelingSelection.length, 2);
  // A selected group is usable by an ordinary geometry tool.
  const tagged = (await inspect(page)).document;
  await page.getByRole("button", { name: "Fillet edges", exact: true }).click();
  await page.getByRole("textbox", { name: "Fillet radius", exact: true }).fill("1");
  await inspect(page);
  await page.keyboard.press("Enter");
  assert.ok((await inspect(page)).document.bodies[0].volume < tagged.bodies[0].volume);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, tagged);
}

async function keyboardEdit(page, row) {
  await row.focus();
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).interaction.kind, "tag-membership");
  await page.getByRole("textbox", { name: "Group name", exact: true }).fill("Cancelled via button");
  await page.getByRole("button", { name: "Cancel", exact: true }).focus();
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).interaction, null);
  assert.equal((await inspect(page)).document.taggedGroups[0].name, "Mounting rim");
}

async function rowAffordances(page, name) {
  const row = page.getByRole("button", { name: "Select group Mounting rim", exact: true });
  assert.ok(await row.isVisible(), "Creation expands the owner's groups automatically");
  const disclosure = page.getByRole("button", { name: "Toggle tagged groups" });
  const toggle = await disclosure.boundingBox();
  const label = await page
    .getByRole("button", { name: "Select Body 1", exact: true })
    .boundingBox();
  assert.ok(toggle.x + toggle.width <= label.x, "Disclosure is before the body label");
  assert.ok(toggle.width <= 28 && toggle.height <= 32, "Compact chevron hit target");
  await disclosure.click();
  assert.equal(await row.isVisible(), false);
  await chooseTool(page, "Tag geometry", "tag-geometry");
  await page.getByRole("textbox", { name: "Group name", exact: true }).fill("Temporary");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await inspect(page);
  assert.ok(await row.isVisible(), "A new group expands a manually collapsed owner");
  const before = (await inspect(page)).document.bodies;
  await page.getByRole("button", { name: "Remove group Temporary", exact: true }).click();
  assert.equal((await inspect(page)).document.taggedGroups.length, 1);
  assert.deepEqual((await inspect(page)).document.bodies, before);
  await page.mouse.move(600, 700);
  await page.screenshot({ path: `.cache/sketch-review/${name}-tag-rows.png` });
}
