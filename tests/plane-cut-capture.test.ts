import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/plane-cut-bent-shell.json", "utf8")) as {
  document: SketchDocument;
};
for (const frame of [planes.YZ, planes.XY, planes.XZ]) {
  test(`captured hollow bend splits on ${JSON.stringify(frame.u)} / ${JSON.stringify(frame.v)}`, async () => {
    const owner = new DocumentOwner();
    try {
      assert.equal(
        (await owner.call({ kind: "open", document: fixture.document })).error,
        undefined,
      );
      const before = owner.view.data;
      const body = before.bodies?.[0];
      assert.ok(body);
      const operation = { mode: "split" as const, targets: [{ body: body.id }], frame };
      assert.equal((await owner.call({ kind: "plane-cut", operation })).error, undefined);
      const pieces = owner.view.candidate?.bodies;
      assert.ok(pieces && pieces.length >= 2);
      assert.equal(owner.view.data, before);
      assert.ok(Math.abs(pieces.reduce((sum, b) => sum + b.volume, 0) - body.volume) < 0.001);
      const ids = pieces.flatMap((b) => [
        b.id,
        ...b.faces.map((f) => f.id),
        ...b.edges.map((e) => e.id),
      ]);
      assert.equal(new Set(ids).size, ids.length);
      await owner.call({ kind: "discard" });
      assert.deepEqual(owner.view.data, before);
      assert.equal((await owner.call({ kind: "plane-cut", operation })).error, undefined);
      await owner.call({ kind: "accept" });
      const after = owner.view.data;
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data, before);
      await owner.call({ kind: "redo" });
      assert.deepEqual(owner.view.data, after);
      assert.equal(
        (await owner.call({ kind: "open", document: readArchive(documentArchive(after)) })).error,
        undefined,
      );
      assert.deepEqual(
        owner.view.data.bodies?.map((b) => b.faces.map((f) => f.id)),
        after.bodies?.map((b) => b.faces.map((f) => f.id)),
      );
    } finally {
      owner.close();
    }
  });
}

test("captured plane cut remains valid after rigid placement and ignores disjoint planes", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const id = owner.view.data.bodies?.[0].id;
    assert.ok(id);
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ids: [id],
            pivot: [0, 0, 0],
            axis: [0, 0, 1],
            angle: 37,
            duplicate: false,
            translation: [100, -70, 23],
          },
        })
      ).error,
      undefined,
    );
    const before = owner.view.data;
    const angle = (37 * Math.PI) / 180;
    const operation = {
      mode: "split" as const,
      targets: [{ body: id }],
      frame: {
        origin: [100, -70, 23] as [number, number, number],
        u: [-Math.sin(angle), Math.cos(angle), 0] as [number, number, number],
        v: [0, 0, 1] as [number, number, number],
      },
    };
    assert.equal((await owner.call({ kind: "plane-cut", operation })).error, undefined);
    assert.equal(owner.view.candidate?.bodies?.length, 2);
    await owner.call({ kind: "discard" });
    assert.deepEqual(owner.view.data, before);
    assert.equal(
      (
        await owner.call({
          kind: "plane-cut",
          operation: {
            ...operation,
            frame: { ...operation.frame, origin: [1000, 1000, 1000] },
          },
        })
      ).error,
      undefined,
    );
    assert.deepEqual(owner.view.candidate, before);
  } finally {
    owner.close();
  }
});
