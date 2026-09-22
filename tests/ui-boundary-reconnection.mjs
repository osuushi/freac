import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { prepareShoulder } from "./ui-edge-move.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { accept, pickAt, pickFace, quantity, startMove } from "./ui-reconnection-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function roundReconnection(page, name, electron) {
  const original = await prepareShoulder(page, name, true);
  let state = await pickAt(page, [0, -6, 10], [0.4, -1, 0.7]);
  assert.equal(state.modelingSelection[0]?.kind, "edge");
  const rimId = state.modelingSelection[0].edge;
  await startMove(page);
  state = await quantity(page, "edges", "Z", 1);
  assert.deepEqual(state.document, original);
  close(state.preview.bodies[0].edges.find((e) => e.id === rimId).curve.center[2], 11);
  const input = page.getByRole("textbox", { name: "Edge translation Z", exact: true });
  await input.fill("-12");
  await inspect(page);
  assert.equal(await page.getByRole("button", { name: "Accept edge movement" }).isEnabled(), false);
  await page.keyboard.press("Enter");
  assert.deepEqual((await inspect(page)).document, original);
  await input.fill("1");
  await inspect(page);
  state = await accept(page, "edge");
  const axial = state.document;
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, axial);
  const top = axial.bodies[0].faces.find((f) =>
    f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 11) < 1e-6),
  );
  await pickFace(page, top);
  await startMove(page);
  state = await quantity(page, "faces", "X", 2);
  close(state.preview.bodies[0].edges.find((e) => e.id === rimId).curve.center[0], 2);
  await orient(page, [1, -1, 0.7]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-reconnected-top-face.png` });
  await accept(page, "face");
  await bodyArchiveRoute(page, `${name}-reconnected-round`, electron);
  const reopened = (await inspect(page)).document;
  await pickFace(
    page,
    reopened.bodies[0].faces.find((f) => f.id === top.id),
  );
  await startMove(page);
  state = await quantity(page, "faces", "Y", 1);
  close(state.preview.bodies[0].edges.find((e) => e.id === rimId).curve.center[1], 1);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, reopened);
  console.log(
    `${name}: upper rim and top-face reconnection, sideways movement, rejection, history and reopen passed`,
  );
}
export async function singleEdgeReconnection(page, name, electron) {
  const original = await prepareShoulder(page, name, false);
  const picked = await pickAt(page, [0, -10, 8], [0, -1, 0.6]);
  assert.equal(picked.modelingSelection[0]?.kind, "edge");
  await startMove(page);
  const box = await page.getByRole("button", { name: "Move edges Z", exact: true }).boundingBox();
  const a = await project(page, [0, -10, 8]),
    b = await project(page, [0, -10, 9]);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + b.x - a.x, y + b.y - a.y, { steps: 5 });
  await page.mouse.up();
  let state = await inspect(page);
  assert.ok(state.preview, await page.getByRole("status").textContent());
  assert.deepEqual(state.document, original);
  assert.ok(state.preview.bodies[0].faces.filter((f) => !f.plane).length >= 2);
  await orient(page, [1, -1, 0.7]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-warped-chamfer.png` });
  await accept(page, "edge");
  await bodyArchiveRoute(page, `${name}-warped-chamfer`, electron);
  const reopened = (await inspect(page)).document;
  const warped = reopened.bodies[0].faces.find((f) => !f.plane);
  assert.ok(warped);
  await pickFace(page, warped);
  await startMove(page);
  state = await quantity(page, "faces", "X", 0.2);
  const moved = state.preview.bodies[0].faces.find((f) => f.id === warped.id);
  close(moved.signature[2], warped.signature[2]);
  close(moved.signature[3], warped.signature[3] + 0.2);
  await accept(page, "face");
  console.log(
    `${name}: single chamfer edge warps adjacent faces; reopened warped face moves rigidly`,
  );
}
