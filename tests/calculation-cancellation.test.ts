import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/slow-face-delete.json", "utf8")) as {
  document: SketchDocument;
  face: string;
};
for (const mixed of [false, true]) {
  test(`cancel captured ${mixed ? "mixed" : "topology"} deletion preserves state and restarts the real kernel`, async () => {
    const owner = new DocumentOwner();
    try {
      assert.equal(
        (await owner.call({ kind: "open", document: fixture.document })).error,
        undefined,
      );
      const before = owner.view;
      const body = before.data.bodies?.[0];
      assert.ok(body);
      const selection = [{ body: body.id, whole: false, faces: [fixture.face], edges: [] }];
      const request = owner.call(
        mixed
          ? { kind: "delete-entities", bodyIds: [], sketchIds: [], topology: selection }
          : { kind: "delete-topology", selection },
      );
      await delay(150);
      assert.equal((await owner.call({ kind: "cancel-preview" })).error, undefined);
      assert.match((await request).error ?? "", /cancelled/);
      assert.equal(owner.view.data, before.data);
      assert.equal(owner.view.candidate, null);
      assert.equal(owner.view.canUndo, before.canUndo);
      assert.equal(owner.view.canRedo, before.canRedo);
      const entry = (await owner.call({ kind: "read-history" })).history?.at(-1);
      assert.equal(entry?.outcome, "cancelled");
      // Open invokes the real kernel to rebuild presentation and validate the same BRep.
      assert.equal((await owner.call({ kind: "open", document: before.data })).error, undefined);
      assert.deepEqual(owner.view.data, before.data);
    } finally {
      owner.close();
    }
  });
}
