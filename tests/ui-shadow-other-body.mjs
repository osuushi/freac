import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function otherBodyOcclusion(page, original, name) {
  await page.keyboard.down("Alt");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.keyboard.up("Alt");
  await page.locator(".body-transform-value").fill("32");
  await page.keyboard.press("Enter");
  const document = (await inspect(page)).document;
  assert.equal(document.bodies.length, 2);
  const other = document.bodies.find((b) => b.id !== original.bodies[0].id);
  const point = await project(page, [other.center[0] + 6, other.center[1], other.bounds[5]]);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  const pivot = page.getByRole("button", { name: "Reposition body pivot", exact: true });
  const covered = async () => {
    await pivot.hover();
    return page
      .locator(".movement-shadows:visible .shadow-occluder")
      .evaluateAll(
        (paths, p) => paths.map((path) => path.isPointInFill(new DOMPoint(p.x, p.y))),
        point,
      );
  };
  assert.deepEqual(
    await covered(),
    [true, true, true],
    "An unselected foreground body occludes all three receivers",
  );
  await page.getByRole("button", { name: "Hide Body 2", exact: true }).click();
  assert.deepEqual(
    await covered(),
    [false, false, false],
    "Hidden bodies must not occlude shadows",
  );
  await page.getByRole("button", { name: "Show Body 2", exact: true }).click();
  assert.deepEqual(await covered(), [true, true, true]);
  assert.deepEqual((await inspect(page)).document, document);
  console.log(`${name}: unselected body occlusion follows hide/show without changing geometry`);
}
