import { click, close, corners, drag, inspect, pointEquals } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function deliveredDrag(page, from, to) {
  const { projection: p } = await inspect(page);
  await click(page, ...from);
  const wasOn = String((await inspect(page)).gridSnap) === "true";
  if (wasOn) await chooseTool(page, "grid snap", "grid");
  await page.evaluate(() =>
    window.addEventListener(
      "pointerup",
      (event) => {
        window.lastPointer = { x: event.clientX, y: event.clientY };
      },
      { once: true },
    ),
  );
  await drag(page, from, to, ["Shift"]);
  if (wasOn) await chooseTool(page, "grid snap", "grid");
  const point = await page.evaluate(() => window.lastPointer);
  const ux = p.u.x - p.origin.x,
    uy = p.u.y - p.origin.y,
    vx = p.v.x - p.origin.x,
    vy = p.v.y - p.origin.y,
    det = ux * vy - uy * vx;
  return {
    x: ((point.x - p.origin.x) * vy - (point.y - p.origin.y) * vx) / det,
    y: (ux * (point.y - p.origin.y) - uy * (point.x - p.origin.x)) / det,
  };
}
export async function rotatedHandles(page) {
  let before = await corners(page);
  const width = Math.hypot(before[1].x - before[0].x, before[1].y - before[0].y);
  const u = { x: (before[1].x - before[0].x) / width, y: (before[1].y - before[0].y) / width };
  const left = { x: (before[0].x + before[3].x) / 2, y: (before[0].y + before[3].y) / 2 };
  const target = await deliveredDrag(page, [left.x, left.y], [left.x - 2 * u.x, left.y - 2 * u.y]);
  let after = await corners(page);
  pointEquals(after[1], [before[1].x, before[1].y]);
  pointEquals(after[2], [before[2].x, before[2].y]);
  const offset = (target.x - before[0].x) * u.x + (target.y - before[0].y) * u.y;
  close(Math.hypot(after[1].x - after[0].x, after[1].y - after[0].y), width - offset);
  before = after;
  const height = Math.hypot(before[3].x - before[0].x, before[3].y - before[0].y);
  const v = { x: (before[3].x - before[0].x) / height, y: (before[3].y - before[0].y) / height };
  const top = { x: (before[2].x + before[3].x) / 2, y: (before[2].y + before[3].y) / 2 };
  const delivered = await deliveredDrag(page, [top.x, top.y], [top.x + 3 * v.x, top.y + 3 * v.y]);
  after = await corners(page);
  pointEquals(after[0], [before[0].x, before[0].y]);
  pointEquals(after[1], [before[1].x, before[1].y]);
  const expected = (delivered.x - before[0].x) * v.x + (delivered.y - before[0].y) * v.y;
  close(Math.hypot(after[3].x - after[0].x, after[3].y - after[0].y), expected);
}
