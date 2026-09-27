import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { DecoratorDefinition } from "../src/decorators/definition.js";
import { documentArchive } from "../src/model/document-archive.js";
import { planes } from "../src/sketch/planes.js";
import { roundBody } from "./decorator-domain-fixtures.js";

async function decoratedCap(owner: DocumentOwner) {
  const definition: DecoratorDefinition = JSON.parse(
    await readFile("examples/decorators/raised-pad.json", "utf8"),
  );
  const body = await roundBody(owner);
  const cap = body.faces.find((f) => f.plane && Math.abs(f.signature[5] - 10) < 1e-7);
  assert.ok(cap);
  await owner.call({ kind: "decorator-definition", edit: { action: "install", definition } });
  await owner.call({ kind: "decorator-enable", id: definition.id, version: 1, enabled: true });
  assert.equal(
    (
      await owner.call({
        kind: "decorator",
        edit: {
          action: "apply",
          definition: definition.id,
          faces: [{ body: body.id, face: cap.id }],
        },
      })
    ).error,
    undefined,
  );
  return { body, cap, definition };
}

test("custom decorations follow moved and split planar faces, preserving settings and Undo", async () => {
  const owner = new DocumentOwner();
  try {
    const { body } = await decoratedCap(owner);
    const before = documentArchive(owner.view.data);
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ids: [body.id],
            pivot: [0, 0, 0],
            axis: [0, 0, 1],
            angle: 0,
            translation: [20, 0, 0],
            duplicate: false,
          },
        })
      ).error,
      undefined,
    );
    let instance = owner.view.data.decorators?.[0];
    assert.ok(instance);
    assert.equal(instance.problem, undefined);
    assert.deepEqual(instance.frame.origin, [20, 0, 0]);
    const settings = instance.settings;
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), before);
    await owner.call({ kind: "redo" });
    instance = owner.view.data.decorators?.[0];
    assert.ok(instance);
    assert.equal(
      (
        await owner.call({
          kind: "plane-cut",
          operation: {
            mode: "imprint",
            targets: [{ body: body.id, faces: instance.faces.map((f) => f.face) }],
            frame: { ...planes.YZ, origin: [20, 0, 0] },
          },
        })
      ).error,
      undefined,
    );
    await owner.call({ kind: "accept" });
    const instances = owner.view.data.decorators ?? [];
    assert.equal(instances.length, 2);
    for (const d of instances) {
      assert.equal(d.problem, undefined);
      assert.deepEqual(d.settings, settings);
    }
    assert.notEqual(instances[0].faces[0].face, instances[1].faces[0].face);
  } finally {
    owner.close();
  }
});

test("disabled custom code leaves a repairable attachment instead of executing during movement", async () => {
  const owner = new DocumentOwner();
  try {
    const { body, definition } = await decoratedCap(owner);
    await owner.call({ kind: "decorator-enable", id: definition.id, version: 1, enabled: false });
    await owner.call({
      kind: "transform-bodies",
      transform: {
        ids: [body.id],
        pivot: [0, 0, 0],
        axis: [0, 0, 1],
        angle: 0,
        translation: [20, 0, 0],
        duplicate: false,
      },
    });
    const instance = owner.view.data.decorators?.[0];
    assert.ok(instance);
    assert.match(instance.problem ?? "", /Enable bundled code/);
    await owner.call({ kind: "decorator-enable", id: definition.id, version: 1, enabled: true });
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "reassign", id: instance.id, faces: [...instance.faces] },
        })
      ).error,
      undefined,
    );
    assert.equal(owner.view.data.decorators?.[0].problem, undefined);
  } finally {
    owner.close();
  }
});

test("custom copies remain independent and merged planar attachments remain unresolved", async () => {
  const owner = new DocumentOwner();
  try {
    const { body } = await decoratedCap(owner);
    const original = owner.view.data.decorators?.[0];
    assert.ok(original);
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ids: [body.id],
            pivot: [0, 0, 0],
            axis: [0, 0, 1],
            angle: 0,
            translation: [2, 0, 0],
            duplicate: true,
          },
        })
      ).error,
      undefined,
    );
    const instances = owner.view.data.decorators ?? [];
    assert.equal(instances.length, 2);
    assert.deepEqual(instances[0], { ...original, problem: undefined });
    assert.equal(instances[1].problem, undefined);
    assert.notEqual(instances[1].id, original.id);
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
    await owner.call({ kind: "accept" });
    assert.ok(owner.view.data.decorators?.every((d) => d.problem?.includes("merged")));
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data.decorators, instances);
  } finally {
    owner.close();
  }
});
