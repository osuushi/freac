import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { lift } from "./body-edge-fixtures.js";

async function overlappingThreads(owner: DocumentOwner) {
  const body = await lift(owner, {
    ...emptySketch(planes.XY),
    curves: [
      { id: "circle", kind: "circle", radius: 5, center: { x: 0, y: 0 }, construction: false },
    ],
  });
  const face = body.faces.find((f) => f.cylinder);
  assert.ok(face);
  assert.equal(
    (
      await owner.call({
        kind: "decorator",
        edit: {
          action: "apply",
          definition: threadDefinition,
          faces: [{ body: body.id, face: face.id }],
        },
      })
    ).error,
    undefined,
  );
  assert.equal(
    (
      await owner.call({
        kind: "transform-bodies",
        transform: {
          ids: [body.id],
          duplicate: true,
          translation: [0, 0, 5],
          pivot: [0, 0, 0],
          axis: [0, 0, 1],
          angle: 0,
        },
      })
    ).error,
    undefined,
  );
}

test("keeping Boolean originals preserves attachments and reports ambiguous output attachments independently", async () => {
  const owner = new DocumentOwner();
  try {
    await overlappingThreads(owner);
    const originals = owner.view.data.decorators ?? [];
    const before = documentArchive(owner.view.data);
    assert.equal(
      (
        await owner.call({
          kind: "boolean-bodies",
          operation: {
            ids: (owner.view.data.bodies ?? []).map((b) => b.id),
            mode: "union",
            keepOriginals: true,
          },
        })
      ).error,
      undefined,
    );
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const after = owner.view.data;
    assert.equal(after.bodies?.length, 3);
    assert.equal(after.decorators?.length, 4);
    for (const original of originals)
      assert.deepEqual(
        after.decorators?.find((d) => d.id === original.id),
        original,
      );
    const inherited = after.decorators?.filter((d) => !originals.some((o) => o.id === d.id)) ?? [];
    assert.equal(inherited.length, 2);
    for (const instance of inherited) assert.match(instance.problem ?? "", /merged/);
    const ids = (after.bodies ?? []).flatMap((b) => [
      b.id,
      ...b.faces.map((f) => f.id),
      ...b.edges.map((e) => e.id),
    ]);
    assert.equal(new Set(ids).size, ids.length);
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), before);
  } finally {
    owner.close();
  }
});

test("merged thread attachments stay unresolved until reassigned or individually removed", async () => {
  const owner = new DocumentOwner();
  try {
    await overlappingThreads(owner);
    const before = documentArchive(owner.view.data);
    assert.equal(
      (
        await owner.call({
          kind: "boolean-bodies",
          operation: {
            ids: (owner.view.data.bodies ?? []).map((b) => b.id),
            mode: "union",
            keepOriginals: false,
          },
        })
      ).error,
      undefined,
    );
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const unresolved = owner.view.data.decorators ?? [];
    assert.equal(unresolved.length, 2);
    for (const instance of unresolved) assert.match(instance.problem ?? "", /merged/);
    const merged = owner.view.data.bodies?.[0];
    assert.ok(merged);
    const support = merged.faces.find((f) => f.cylinder);
    assert.ok(support);
    const archive = documentArchive(owner.view.data);
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(archive) })).error,
      undefined,
    );
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "reassign",
            id: unresolved[0].id,
            faces: [{ body: merged.id, face: support.id }],
          },
        })
      ).error,
      undefined,
    );
    assert.equal(owner.view.data.decorators?.[0].problem, undefined);
    assert.equal(owner.view.data.decorators?.[1].problem, unresolved[1].problem);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "discard",
            id: unresolved[1].id,
          },
        })
      ).error,
      undefined,
    );
    assert.equal(owner.view.data.decorators?.length, 1);
    assert.equal(owner.view.data.decorators?.[0].id, unresolved[0].id);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data.decorators?.length, 2);
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), archive);
    // Opening starts a new history; reopen the original to verify its independent attachments.
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(before) })).error,
      undefined,
    );
    assert.ok(owner.view.data.decorators?.every((d) => !d.problem));
  } finally {
    owner.close();
  }
});
