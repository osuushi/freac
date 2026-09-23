import assert from "node:assert/strict";
import * as THREE from "three";
import { project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";

export async function overlapEdges(page, hold) {
  await page.keyboard.press("Escape");
  const state = await inspect(page),
    body = state.document.bodies[0];
  const direction = new THREE.Vector3(...state.camera.target)
    .sub(new THREE.Vector3(...state.camera.position))
    .normalize();
  let hidden = 0,
    silhouette = 0;
  for (const edge of body.edges) {
    const adjacent = body.faces.filter((f) => f.edges.includes(edge.id));
    const front = adjacent.filter(
      (f) =>
        new THREE.Triangle(
          new THREE.Vector3().fromArray(f.vertices),
          new THREE.Vector3().fromArray(f.vertices, 3),
          new THREE.Vector3().fromArray(f.vertices, 6),
        )
          .getNormal(new THREE.Vector3())
          .dot(direction) < 0,
    ).length;
    if (front === adjacent.length) continue;
    const midpoint = new THREE.Vector3()
      .fromArray(edge.points)
      .add(new THREE.Vector3().fromArray(edge.points, edge.points.length - 3))
      .multiplyScalar(0.5);
    const p = await project(page, midpoint.toArray());
    if (!(await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS", p)))
      continue;
    await hold(page, p);
    const panel = page.getByRole("dialog", { name: "Choose overlapping geometry" });
    await panel.waitFor({ state: "visible" });
    const offered = await panel.locator(`[data-kind="edge"][data-key="${edge.id}"]`).count();
    assert.equal(
      offered,
      front ? 1 : 0,
      front ? "Front/back silhouette edge is selectable" : "Back/back edge excluded",
    );
    if (front) silhouette++;
    else hidden++;
    await page.keyboard.press("Escape");
    await page.mouse.up();
  }
  assert.ok(
    hidden && silhouette,
    "Exercise both back/back and front/back edges through actual holds",
  );
}
