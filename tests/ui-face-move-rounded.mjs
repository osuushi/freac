import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { openDocument } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { close, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function selectRounded(page, ids) {
  const body = (await inspect(page)).document.bodies[0];
  for (let i = 0; i < ids.length; i++) {
    const face = body.faces.find((f) => f.id === ids[i]);
    const center = new THREE.Vector3(...face.signature.slice(3, 6));
    let normal;
    if (face.cylinder) {
      const origin = new THREE.Vector3(...face.cylinder.origin);
      const radial = center.clone().sub(origin).setZ(0).normalize();
      center.copy(origin).addScaledVector(radial, face.cylinder.radius);
      normal = radial.multiplyScalar(face.cylinder.outward);
    } else {
      normal = new THREE.Vector3(...face.plane.u).cross(new THREE.Vector3(...face.plane.v));
    }
    if (Math.abs(normal.z) < 0.1) center.z = face.signature[5];
    const yaw = Math.atan2(normal.y, normal.x),
      pitch = Math.min(Math.acos(normal.z), 0.6);
    await orient(page, [
      Math.cos(yaw) * Math.sin(pitch),
      Math.sin(yaw) * Math.sin(pitch),
      Math.cos(pitch),
    ]);
    await worldClick(page, center.toArray(), i > 0);
    const state = await inspect(page);
    if (!state.modelingSelection.some((s) => s.face === ids[i]))
      await page.screenshot({ path: ".cache/sketch-review/rounded-pick-failure.png" });
    assert.ok(
      state.modelingSelection.some((s) => s.face === ids[i]),
      JSON.stringify({ wanted: ids[i], center, actual: state.modelingSelection }),
    );
  }
}
export async function roundedFaceMoveRoute(page, name, electron, file = "filleted-pocket-move") {
  const fixture = JSON.parse(readFileSync(`tests/fixtures/${file}.json`, "utf8"));
  const axis = fixture.operation.translation.findIndex((v) => v !== 0);
  const letter = "XYZ"[axis],
    distance = fixture.operation.translation[axis];
  const ids = fixture.operation.faces.map((f) => f.face);
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await inspect(page);
  await chooseTool(page, "return to modeling", "modeling");
  await openDocument(page, {
    name: `${file}.freac`,
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "freac", version: 1, document: fixture.document }),
    ),
  });
  await page.waitForFunction(() => window.freacInspect().document.bodies?.length === 1);
  const original = (await inspect(page)).document;
  await selectRounded(page, ids);
  assert.equal((await inspect(page)).modelingSelection.length, ids.length);
  await page.keyboard.press("m");
  await page.getByRole("button", { name: `Move faces ${letter}`, exact: true }).click();
  const input = page.getByRole("textbox", { name: `Face translation ${letter}`, exact: true });
  await input.fill(String(distance));
  let state = await inspect(page);
  assert.ok(state.preview, await page.getByRole("status").textContent());
  assert.deepEqual(state.document, original);
  close(state.preview.bodies[0].volume, original.bodies[0].volume);
  await input.fill("50");
  await inspect(page);
  assert.equal(await input.getAttribute("aria-invalid"), "true");
  assert.equal(await page.getByRole("button", { name: "Accept face movement" }).isEnabled(), false);
  await input.fill(String(distance));
  await inspect(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-${file}.png` });
  await page.keyboard.press("Enter");
  state = await inspect(page);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, state.document);
  await bodyArchiveRoute(page, `${name}-${file}`, electron);
  await selectRounded(page, ids);
  await page.keyboard.press("m");
  await page.getByRole("button", { name: `Move faces ${letter}`, exact: true }).click();
  await input.fill(String(-distance));
  state = await inspect(page);
  assert.ok(state.preview, await page.getByRole("status").textContent());
  for (let i = 0; i < 3; i++)
    close(state.preview.bodies[0].center[i], original.bodies[0].center[i]);
  await page.keyboard.press("Escape");
  console.log(
    `${name}: ${file} selection, move, invalid recovery, history, Save/Open and reverse preview passed`,
  );
}
