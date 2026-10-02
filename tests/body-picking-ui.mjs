import assert from "node:assert/strict";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { emptySketch } from "../.cache/sketch-tests/src/sketch/document.js";
import { planes } from "../.cache/sketch-tests/src/sketch/planes.js";
import { lift, prism } from "../.cache/sketch-tests/tests/body-edge-fixtures.js";
import { roundBody } from "../.cache/sketch-tests/tests/decorator-domain-fixtures.js";
import { openDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { hold } from "./ui-overlap-gesture.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

async function fixture(create) {
  const owner = new DocumentOwner();
  try {
    await create(owner);
    return { ...owner.view.data, sketches: [] };
  } finally {
    owner.close();
  }
}
const covered = await fixture(async (owner) => {
  await prism(owner, [
    [-15, -15],
    [15, -15],
    [15, 15],
    [-15, 15],
  ]);
  await lift(owner, {
    ...emptySketch({ ...planes.XY, origin: [0, 0, -20] }),
    curves: structuredClone(owner.view.data.sketches[0].curves),
  });
});
const curved = await fixture((owner) => roundBody(owner, [10]));

async function open(page, document) {
  await inspect(page);
  await openDocument(page, {
    name: "picking.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "makeshift", version: 1, document })),
  });
  return inspect(page);
}
async function offered(page, point, edge) {
  await page.keyboard.press("Escape");
  await hold(page, point);
  const panel = page.getByRole("dialog", { name: "Choose overlapping geometry" });
  await panel.waitFor({ state: "visible" });
  const count = await panel.locator(`[data-kind="edge"][data-key="${edge}"]`).count();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  return count;
}

await withUiRuntimes(async (page, name) => {
  let state = await open(page, covered);
  const [front, rear] = state.document.bodies;
  const left = (body, z) =>
    body.edges.find((edge) =>
      edge.points.every((v, i) => i % 3 === 1 || Math.abs(v - (i % 3 === 0 ? -15 : z)) < 1e-6),
    );
  const frontEdge = left(front, 10),
    rearEdge = left(rear, -10);
  assert.ok(frontEdge && rearEdge);
  await orient(page, [0, 0, 1]);
  const point = await project(page, [-15, 0, 10]);
  await page.mouse.click(point.x, point.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.edge, frontEdge.id);
  assert.equal(
    await offered(page, point, rearEdge.id),
    1,
    "covered front-facing edge remains an explicit choice",
  );
  await hold(page, point);
  await page
    .getByRole("dialog", { name: "Choose overlapping geometry" })
    .locator(`[data-kind="edge"][data-key="${rearEdge.id}"]`)
    .hover();
  await page.mouse.up();
  assert.equal((await inspect(page)).modelingSelection[0]?.edge, rearEdge.id);
  assert.deepEqual((await inspect(page)).document, state.document, "choice is transient selection");

  state = await open(page, curved);
  const body = state.document.bodies[0];
  const bottom = body.edges.find(
    (edge) =>
      edge.points.length > 9 && edge.points.every((v, i) => i % 3 !== 2 || Math.abs(v) < 1e-6),
  );
  assert.ok(bottom);
  await orient(page, [0, -1, 1]);
  const near = await project(page, [0, -10, 0]),
    far = await project(page, [0, 10, 0]);
  await page.mouse.click(near.x, near.y);
  assert.equal(
    (await inspect(page)).modelingSelection[0]?.edge,
    bottom.id,
    "curved silhouette picks the locally facing side",
  );
  assert.equal(await offered(page, near, bottom.id), 1);
  assert.equal(
    await offered(page, far, bottom.id),
    0,
    "back/back part of a curved edge is excluded",
  );
  console.log(
    `${name}: covered-edge ordinary/chooser precedence, explicit rear choice and curved local-facing controls pass`,
  );
});
