import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { prism, square } from "./body-edge-fixtures.js";

test("appearance preserves exact geometry, validates alpha, and survives history, copies and archive", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const appearance = { body: body.id, color: "#dd4422", alpha: 0.35 };
    assert.equal((await owner.call({ kind: "body-appearance", appearance })).error, undefined);
    assert.deepEqual(owner.view.data.bodies, [body]);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data.bodyAppearances?.length ?? 0, 0);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data.bodyAppearances, [appearance]);
    for (const alpha of [-1, 1.01, NaN, Infinity])
      assert.ok(
        (await owner.call({ kind: "body-appearance", appearance: { ...appearance, alpha } })).error,
      );
    for (const color of ["red", "#fff", "#gg0000"])
      assert.ok(
        (await owner.call({ kind: "body-appearance", appearance: { ...appearance, color } })).error,
      );
    assert.ok(
      (
        await owner.call({
          kind: "body-appearance",
          appearance: { ...appearance, body: "missing" },
        })
      ).error,
    );
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ids: [body.id],
            axis: [0, 0, 1],
            pivot: [0, 0, 0],
            angle: 0,
            translation: [30, 0, 0],
            duplicate: true,
          },
        })
      ).error,
      undefined,
    );
    const saved = owner.view.data;
    assert.equal(saved.bodyAppearances?.length, 2);
    assert.ok(
      saved.bodyAppearances?.every(
        (entry) => entry.color === appearance.color && entry.alpha === appearance.alpha,
      ),
    );
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(documentArchive(saved)) })).error,
      undefined,
    );
    assert.deepEqual(owner.view.data.bodyAppearances, saved.bodyAppearances);
    await owner.call({ kind: "delete-entities", bodyIds: [body.id], sketchIds: [] });
    assert.equal(owner.view.data.bodyAppearances?.length, 1);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data.bodyAppearances, saved.bodyAppearances);
  } finally {
    owner.close();
  }
});

test("split pieces inherit appearance and a merge uses its first source", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    await owner.call({
      kind: "body-appearance",
      appearance: { body: body.id, color: "#2288cc", alpha: 0.5 },
    });
    const { planes } = await import("../src/sketch/planes.js");
    assert.equal(
      (
        await owner.call({
          kind: "plane-cut",
          operation: {
            mode: "split",
            targets: [{ body: body.id }],
            frame: { ...planes.XY, origin: [0, 0, 5] },
          },
        })
      ).error,
      undefined,
    );
    assert.equal(owner.view.candidate?.bodyAppearances?.length, 2);
    assert.ok(
      owner.view.candidate?.bodyAppearances?.every(
        (entry) => entry.color === "#2288cc" && entry.alpha === 0.5,
      ),
    );
    await owner.call({ kind: "accept" });
    const pieces = owner.view.data.bodies ?? [];
    await owner.call({
      kind: "body-appearance",
      appearance: { body: pieces[1].id, color: "#cc8822", alpha: 1 },
    });
    assert.equal(
      (
        await owner.call({
          kind: "boolean-bodies",
          operation: {
            ids: pieces.map((piece) => piece.id),
            mode: "union",
            keepOriginals: false,
          },
        })
      ).error,
      undefined,
    );
    assert.equal(owner.view.candidate?.bodies?.length, 1);
    assert.equal(owner.view.candidate?.bodyAppearances?.[0].color, "#2288cc");
    assert.equal(owner.view.candidate?.bodyAppearances?.[0].alpha, 0.5);
  } finally {
    owner.close();
  }
});
