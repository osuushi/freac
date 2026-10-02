import assert from "node:assert/strict";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { emptySketch } from "../.cache/sketch-tests/src/sketch/document.js";
import { planes } from "../.cache/sketch-tests/src/sketch/planes.js";
import { lift, prism } from "../.cache/sketch-tests/tests/body-edge-fixtures.js";
import { openDocument } from "./native-documents.mjs";
import { project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { hold } from "./ui-overlap-gesture.mjs";

async function framingDocument() {
  const owner = new DocumentOwner();
  try {
    await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [
        { id: "circle", kind: "circle", center: { x: 0, y: 0 }, radius: 2, construction: false },
      ],
    });
    for (const x of [-400, 400])
      await prism(owner, [
        [x - 20, -20],
        [x + 20, -20],
        [x + 20, 20],
        [x - 20, 20],
      ]);
    return JSON.parse(JSON.stringify({ ...owner.view.data, sketches: [] }));
  } finally {
    owner.close();
  }
}

export async function overlapFraming(page, name) {
  const document = await framingDocument();
  // At this camera height the real target is smaller than one viewport pixel.
  await openDocument(page, {
    name: "small-overlap.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "makeshift",
        version: 1,
        document,
        camera: { position: [55, -70, 75], target: [0, 0, 10], up: [0, 0, 1], height: 10000 },
      }),
    ),
  });
  const original = (await inspect(page)).document;
  await hold(page, await project(page, [0, 0, 10]));
  const panel = page.getByRole("dialog", { name: "Choose overlapping geometry" });
  await panel.waitFor({ state: "visible" });
  const body = document.bodies[0];
  for (const kind of ["face", "body", "edge"]) {
    const choice = panel.locator(`[data-kind="${kind}"]`).first();
    assert.equal(await choice.count(), 1, `${kind} is offered through an actual hold`);
    const boxes = await choice.locator("svg").evaluate((svg) => {
      const paths = [...svg.querySelectorAll("path")];
      const box = (path) => {
        const b = path.getBBox();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      };
      return {
        target: paths
          .slice(2)
          .filter((p) => p.getAttribute("d"))
          .map(box),
        context: box(paths[0]),
        overflow: getComputedStyle(svg).overflow,
      };
    });
    const left = Math.min(...boxes.target.map((b) => b.x));
    const top = Math.min(...boxes.target.map((b) => b.y));
    const right = Math.max(...boxes.target.map((b) => b.x + b.width));
    const bottom = Math.max(...boxes.target.map((b) => b.y + b.height));
    assert.ok(
      Math.max((right - left) / 128, (bottom - top) / 88) >= 0.499,
      `${kind} fills at least half the usable width or height`,
    );
    assert.ok(
      left >= 8 && top >= 8 && right <= 136 && bottom <= 96,
      `${kind} remains fully inside the diagram`,
    );
    assert.ok(Math.abs((left + right) / 2 - 72) < 0.01);
    assert.ok(Math.abs((top + bottom) / 2 - 52) < 0.01);
    assert.ok(
      boxes.context.width > 144,
      "Distant bodies are cropped, rather than shrinking the target",
    );
    assert.equal(boxes.overflow, "hidden");
  }
  // The edge keeps the owning body as context, including geometry beside the rim.
  const edge = panel.locator('[data-kind="edge"]').first();
  await edge.hover();
  await page.screenshot({ path: `.cache/sketch-review/${name}-overlap-crop.png` });
  const selectedEdge = await edge.getAttribute("data-key");
  await page.mouse.up();
  assert.equal((await inspect(page)).modelingSelection[0].edge, selectedEdge);
  await page.keyboard.press("Escape");
  await hold(page, await project(page, [0, 0, 10]));
  await panel.locator(`[data-kind="body"][data-key="${body.id}"]`).hover();
  await page.mouse.up();
  assert.equal((await inspect(page)).modelingSelection[0].body, body.id);
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    `${name}: subpixel face/body/edge previews enlarge, crop context and retain selection routes`,
  );
}
