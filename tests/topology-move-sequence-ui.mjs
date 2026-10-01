import assert from "node:assert/strict";
import { orient, outwardDrag } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function quantity(page, rotate, axis, value) {
  await page
    .getByRole("button", { name: `${rotate ? "Rotate" : "Move"} faces ${axis}`, exact: true })
    .click();
  await page
    .getByRole("textbox", {
      name: `Face ${rotate ? "rotation" : "translation"} ${axis}`,
      exact: true,
    })
    .fill(String(value));
  return inspect(page);
}

function faceRim(body, id) {
  const face = body.faces.find((face) => face.id === id);
  const rim = body.edges.find(
    (edge) => face.edges.includes(edge.id) && edge.curve?.kind === "circle",
  );
  assert.ok(rim);
  return rim.curve;
}

function rimEquals(actual, expected) {
  close(actual.radius, expected.radius);
  for (const key of ["center", "normal"])
    actual[key].forEach((n, i) => {
      close(n, expected[key][i], `${key}[${i}] ${JSON.stringify({ actual, expected })}`);
    });
}

async function selectCylinderCap(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [8, 0]);
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  const body = (await inspect(page)).document.bodies[0];
  const cap = body.faces.find((face) =>
    face.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 10) < 1e-6),
  );
  assert.ok(cap);
  await worldClick(page, [0, 0, 10]);
  assert.equal((await inspect(page)).modelingSelection[0]?.face, cap.id);
  await orient(page, [0.5, 0.5, 1]);
  await page.keyboard.press("m");
  return cap;
}

async function identityKeepsRedo(page, original) {
  await quantity(page, true, "X", 15);
  await quantity(page, true, "X", -15);
  assert.equal(
    await page.getByRole("button", { name: "Accept face movement", exact: true }).isEnabled(),
    false,
  );
  await page.keyboard.press("Enter");
  assert.deepEqual((await inspect(page)).document, original);
  assert.equal((await inspect(page)).preview, null);
}

await withUiRuntimes(async (page, name) => {
  const cap = await selectCylinderCap(page);
  const original = (await inspect(page)).document;
  const rotated = await quantity(page, true, "X", 15);
  assert.ok(rotated.preview);
  const expected = {
    center: [1, 0, 10],
    normal: [0, -Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)],
    radius: 8,
  };
  let state = await quantity(page, false, "X", 1);
  assert.ok(state.preview);
  rimEquals(faceRim(state.preview.bodies[0], cap.id), expected);
  assert.deepEqual(state.document, original);
  const input = page.getByRole("textbox", { name: "Face translation X", exact: true });
  await input.fill("");
  await inspect(page);
  assert.equal(
    await page.getByRole("button", { name: "Accept face movement", exact: true }).isEnabled(),
    false,
  );
  await input.fill("1");
  state = await inspect(page);
  rimEquals(faceRim(state.preview.bodies[0], cap.id), expected);
  await quantity(page, false, "Y", 0);
  assert.equal(
    await page.getByRole("button", { name: "Accept face movement", exact: true }).isEnabled(),
    true,
  );
  state = await inspect(page);
  rimEquals(faceRim(state.preview.bodies[0], cap.id), expected);
  state = await outwardDrag(
    page,
    "Move faces Y",
    { offsetHandle: { center: [0, 0, 10], normal: [0, 1, 0] } },
    2,
  );
  expected.center[1] = 2;
  rimEquals(faceRim(state.preview.bodies[0], cap.id), expected);
  assert.deepEqual(state.document, original, "Pointer release retains the combined preview");
  await page.keyboard.press("Enter");
  const accepted = (await inspect(page)).document;
  rimEquals(faceRim(accepted.bodies[0], cap.id), expected);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(
    (await inspect(page)).document,
    original,
    "One Undo restores the entire sequence",
  );
  await identityKeepsRedo(page, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await quantity(page, false, "X", 1);
  state = await quantity(page, true, "X", -10);
  const afterRotation = faceRim(state.preview.bodies[0], cap.id);
  close(afterRotation.center[0], 2, "Rotation after movement retains the X displacement");
  close(afterRotation.normal[1], -Math.sin(Math.PI / 36));
  close(afterRotation.normal[2], Math.cos(Math.PI / 36));
  state = await quantity(page, true, "Y", 10);
  const compound = faceRim(state.preview.bodies[0], cap.id);
  close(compound.normal[0], Math.sin(Math.PI / 18) * Math.cos(Math.PI / 36));
  close(compound.normal[1], -Math.sin(Math.PI / 36));
  close(compound.normal[2], Math.cos(Math.PI / 18) * Math.cos(Math.PI / 36));
  await quantity(page, false, "Y", 1);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, accepted);
  assert.equal((await inspect(page)).preview, null);
  console.log(
    `${name}: single-face rotation then translation, zero-value handle switch, one-step Undo/Redo and cancellation passed`,
  );
});
