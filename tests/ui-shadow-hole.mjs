import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { contactTransition } from "./ui-shadow-contact.mjs";
import { screenshotPixels } from "./ui-shadow-occlusion.mjs";
import { otherBodyOcclusion } from "./ui-shadow-other-body.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function shadowHoleRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("c");
  await drag(page, [15, 15], [23, 15]);
  await drag(page, [15, 15], [19, 15]);
  const pick = await at(page, 21, 15);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("6");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.keyboard.press("m");
  await orient(page, [1, 1, 4]);
  const before = (await inspect(page)).document;
  assert.ok(Math.abs(before.bodies[0].volume - Math.PI * 48 * 6) < 1e-5);
  const center = await project(page, [15, 15, 0]);
  const samples = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8;
    const edge = await project(page, [15 + 8 * Math.cos(angle), 15 + 8 * Math.sin(angle), 0]);
    const length = Math.hypot(edge.x - center.x, edge.y - center.y);
    samples.push({
      x: edge.x + (8 * (edge.x - center.x)) / length,
      y: edge.y + (8 * (edge.y - center.y)) / length,
    });
  }
  await page.mouse.move(30, 740);
  const unlit = await screenshotPixels(page, samples);
  await page.getByRole("button", { name: "Reposition body pivot", exact: true }).hover();
  const shadows = page.locator(".movement-shadows:visible");
  assert.equal(await shadows.count(), 1);
  assert.equal(await shadows.locator("[data-plane]:visible").getAttribute("data-plane"), "XY");
  assert.equal(await shadows.locator("[data-plane]:visible").getAttribute("data-contact"), "true");
  const lit = await screenshotPixels(page, samples);
  assert.ok(
    lit.filter((p, i) => p[2] - p[0] > unlit[i][2] - unlit[i][0] + 20).length >= 3,
    "Contact must emit visible blue light beyond the section boundary",
  );
  const fill = await shadows
    .locator('[data-plane="XY"] .shadow-surface')
    .last()
    .evaluate((path) => ({
      hole: path.isPointInFill(new DOMPoint(15, 15)),
      material: path.isPointInFill(new DOMPoint(21, 15)),
    }));
  assert.deepEqual(fill, { hole: false, material: true });
  await page.screenshot({ path: `.cache/sketch-review/${name}-movement-shadow-hole.png` });
  await page.mouse.move(30, 740);
  assert.equal(await shadows.count(), 0);
  assert.deepEqual((await inspect(page)).document, before);
  await contactTransition(page, before);
  await otherBodyOcclusion(page, before, name);
  console.log(
    `${name}: curved silhouette preserves its projected opening; anchor hover leaves geometry unchanged`,
  );
}
