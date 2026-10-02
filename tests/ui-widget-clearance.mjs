import assert from "node:assert/strict";

export async function assertWidgetClearance(page, root) {
  // Zoom/orbit can carry the entire assembly offscreen. Center it through
  // middle-button pan before checking reachability; widgets are not edge-clamped.
  const anchor = await root.locator(".move-anchor").boundingBox();
  const canvas = await page.locator("canvas").boundingBox();
  const center = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(
    center.x * 2 - anchor.x - anchor.width / 2,
    center.y * 2 - anchor.y - anchor.height / 2,
    { steps: 4 },
  );
  await page.mouse.up({ button: "middle" });
  await page.mouse.move(20, 20);
  await page.waitForTimeout(160);
  const handles = root.locator(".body-axis-handle:visible, .move-anchor:visible");
  const boxes = await handles.evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    for (const b of boxes.slice(i + 1)) {
      assert.ok(
        a.x + a.width + 5 <= b.x ||
          b.x + b.width + 5 <= a.x ||
          a.y + a.height + 5 <= b.y ||
          b.y + b.height + 5 <= a.y,
        "visible widget hit rectangles have a clear gap",
      );
    }
    const handle = handles.nth(i);
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    const hit = await handle.evaluate((node) => {
      const r = node.getBoundingClientRect();
      const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        owns: target === node || node.contains(target),
        control: node.getAttribute("aria-label"),
        target: target?.outerHTML.slice(0, 300),
        x: r.x,
        y: r.y,
        viewport: [innerWidth, innerHeight],
      };
    });
    assert.equal(
      hit.owns,
      true,
      `the visible control owns its pointer target: ${JSON.stringify(hit)}`,
    );
    const before = await handle.boundingBox();
    await page.waitForTimeout(120);
    assert.deepEqual(await handle.boundingBox(), before, "hovered widgets stay still");
  }
  await page.mouse.move(20, 20);
}
