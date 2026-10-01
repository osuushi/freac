import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDocument } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect, reset } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(readFileSync("tests/fixtures/offset-move-tilted-plate.json", "utf8"));
async function open(page, index) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "return to modeling", "modeling");
  await openDocument(page, {
    name: "capture.freac",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "freac",
        version: 1,
        document: { ...fixture.document, bodies: [fixture.document.bodies[index]] },
      }),
    ),
  });
  await page.waitForFunction(() => window.freacInspect().document.bodies?.length === 1);
  return (await inspect(page)).document;
}
async function history(page, original) {
  const accepted = (await inspect(page)).document;
  assert.notEqual(accepted.bodies[0].brep, original.bodies[0].brep);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
}
async function route(page, name) {
  let original = await open(page, 1);
  await orient(page, [0, -1, 0.25]);
  await worldClick(page, [-12, 6, 0]);
  assert.equal(
    (await inspect(page)).modelingSelection[0]?.face,
    "f0bd87fc-be57-46fc-a23a-563623974875",
  );
  await page.getByRole("button", { name: "Offset faces", exact: true }).click();
  const offset = await relativeOffsetInput(page);
  for (const distance of [-8, 22]) {
    await offset.fill(String(distance));
    const state = await inspect(page);
    assert.ok(state.preview, await page.getByRole("status").textContent());
    assert.ok(
      Math.abs(
        state.preview.bodies[0].volume - original.bodies[0].volume - Math.PI * 16 * distance,
      ) < 1e-5,
    );
  }
  await page.keyboard.press("Enter");
  await history(page, original);
  for (const roundedFaces of [0, 2, 1]) {
    const end = roundedFaces > 0;
    original = await open(page, 0);
    await orient(page, end ? [-1, -1, 0.3] : [0.4, -1, 0.3]);
    const picks = end
      ? [
          [6.066, 14, -4],
          [6.066, 14, 4],
        ].slice(0, roundedFaces)
      : [[15.5, 14, -1.922]];
    for (let i = 0; i < picks.length; i++) await worldClick(page, picks[i], i > 0);
    const selection = (await inspect(page)).modelingSelection;
    assert.equal(selection.length, picks.length, JSON.stringify(selection));
    assert.ok(
      selection.every((item) => item.kind === "face"),
      JSON.stringify(selection),
    );
    assert.deepEqual(
      selection.map((item) => item.face).sort(),
      end
        ? ["c73d0cec-15e0-467e-a233-e8302b5d2f26", "e43a9f58-baf3-431c-a532-bfc87532a70d"].slice(
            0,
            roundedFaces,
          )
        : ["6516dd0f-680c-4c05-a20a-923abd04f9e0"],
    );
    await page.keyboard.press("m");
    await page.getByRole("button", { name: "Move faces X", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Face translation X", exact: true });
    for (const distance of [-6, 6]) {
      await input.fill(String(distance));
      const state = await inspect(page);
      assert.ok(state.preview, await page.getByRole("status").textContent());
      assert.deepEqual(state.document, original);
      for (const target of selection) {
        const before = original.bodies[0].faces.find((face) => face.id === target.face);
        const after = state.preview.bodies[0].faces.find((face) => face.id === target.face);
        assert.ok(before && after);
        assert.ok(Math.abs(after.signature[3] - before.signature[3] - distance) < 1e-6);
      }
    }
    await page.keyboard.press("Enter");
    await history(page, original);
  }
  console.log(
    `${name}: captured cap Offset, hole, rounded-end and individual-face Transform, both directions and Undo/Redo passed`,
  );
}
await withUiRuntimes(route, { timeout: 30000 });
