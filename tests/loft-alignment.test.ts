import assert from "node:assert/strict";
import { test } from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { draw, near, preview, rectangle } from "./loft-fixtures.js";

test("seam steps change real correspondence and reset recovers an untwisted prism", async () => {
  const owner = new DocumentOwner();
  try {
    const sections = [await draw(owner, rectangle(0, 5)), await draw(owner, rectangle(10, 5))];
    const base = await preview(owner, sections, { ruled: true });
    near(base.volume, 1000);
    const twisted = await preview(owner, sections, { ruled: true, alignment: [0, 1] });
    // Linear interpolation to a quarter-turned square has area 100*((1-t)^2+t^2).
    near(twisted.volume, 2000 / 3);
    const reversed = await preview(owner, sections, { ruled: true, alignment: [0, -1] });
    near(reversed.volume, 2000 / 3);
    const reset = await preview(owner, sections, { ruled: true });
    near(reset.volume, base.volume);
    assert.deepEqual(owner.view.data.bodies, undefined);
  } finally {
    owner.close();
  }
});
