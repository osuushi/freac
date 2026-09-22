import assert from "node:assert/strict";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { makeFeature, pickFeatureFace } from "./ui-face-move-fixtures.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { accept, quantity, startMove } from "./ui-reconnection-helpers.mjs";

export async function featureReconnection(page, name, electron, kind) {
  const hole = kind === "hole",
    pocket = kind === "pocket";
  const { body, faces } = await makeFeature(page, pocket || hole, hole ? 0 : 4, hole);
  for (let i = 0; i < faces.length; i++)
    await pickFeatureFace(page, faces[i], i > 0, pocket || hole, hole);
  await startMove(page);
  const state = await quantity(page, "faces", "X", 2);
  close(state.preview.bodies[0].volume, body.volume);
  const selected = new Set(faces.map((f) => f.id));
  for (const face of body.faces) {
    if (selected.has(face.id)) continue;
    assert.ok(state.preview.bodies[0].faces.find((f) => f.id === face.id).plane);
  }
  await accept(page, "face");
  await page.getByRole("button", { name: "Rotate faces Z", exact: true }).click();
  await page.getByRole("textbox", { name: "Face rotation Z", exact: true }).fill("15");
  const rotated = await inspect(page);
  assert.ok(rotated.preview, await page.getByRole("status").textContent());
  close(rotated.preview.bodies[0].volume, body.volume);
  await page.keyboard.press("Escape");
  await bodyArchiveRoute(page, `${name}-reconnected-${kind}`, electron);
  console.log(
    `${name}: shared ${kind} reconnection preserves planar stock, volume and archive identity`,
  );
}
