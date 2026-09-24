import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { validateMesh } from "../src/model/export-mesh.js";
import { planes } from "../src/sketch/planes.js";
import { roundBody } from "./decorator-domain-fixtures.js";

test("split threads preserve axial insets and tapers through export, archive and transforms", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await roundBody(owner);
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
            settings: { cut: "hole", start: 1, end: 2, startTaper: 2, endTaper: 1 },
          },
        })
      ).error,
      undefined,
    );
    const before = documentArchive(owner.view.data);
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
    await owner.call({ kind: "accept" });
    const split = documentArchive(owner.view.data);
    assert.equal(owner.view.data.decorators?.length, 2);
    for (const d of owner.view.data.decorators ?? []) {
      assert.equal(d.problem, undefined);
      assert.deepEqual(d.axialReference, [0, 10]);
    }
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), before);
    await owner.call({ kind: "redo" });
    assert.equal(documentArchive(owner.view.data), split);
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(split) })).error,
      undefined,
    );
    const prepared = (await owner.call({ kind: "export-geometry" })).exportDocument;
    assert.ok(prepared);
    const meshes = decoratedMeshes(await initializeMeshRuntime(), prepared);
    for (const mesh of meshes) {
      validateMesh(mesh);
      assert.ok(
        mesh.vertices.some((p) => Math.abs(p[2] - 5) < 0.05 && Math.hypot(p[0], p[1]) > 5.6),
        "split boundary must retain full thread depth, not restart a taper",
      );
      for (const p of mesh.vertices)
        if (p[2] < 0.999 || p[2] > 8.001)
          assert.ok(Math.hypot(p[0], p[1]) < 5.001, "insets must retain their original reference");
    }
    const instance = owner.view.data.decorators?.[0];
    assert.ok(instance);
    assert.equal(
      (
        await owner.call({
          kind: "scale",
          operation: {
            kind: "solids",
            ids: [instance.faces[0].body],
            faces: [],
            edges: [],
            pivot: [0, 0, 0],
            factor: 2,
          },
        })
      ).error,
      undefined,
    );
    await owner.call({ kind: "accept" });
    const scaled = owner.view.data.decorators?.find((d) => d.id === instance.id);
    assert.deepEqual(scaled?.axialReference, [0, 20]);
    assert.deepEqual(scaled?.settings, instance.settings);
  } finally {
    owner.close();
  }
});

test("a split piece outside the inherited thread band exports without a decoration error", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await roundBody(owner);
    const face = body.faces.find((f) => f.cylinder);
    assert.ok(face);
    await owner.call({
      kind: "decorator",
      edit: {
        action: "apply",
        definition: threadDefinition,
        faces: [{ body: body.id, face: face.id }],
        settings: { cut: "hole", start: 1, end: 2 },
      },
    });
    assert.equal(
      (
        await owner.call({
          kind: "plane-cut",
          operation: {
            mode: "split",
            targets: [{ body: body.id }],
            frame: { ...planes.XY, origin: [0, 0, 0.5] },
          },
        })
      ).error,
      undefined,
    );
    await owner.call({ kind: "accept" });
    assert.ok(owner.view.data.decorators?.every((d) => !d.problem));
    const prepared = (await owner.call({ kind: "export-geometry" })).exportDocument;
    assert.ok(prepared);
    const meshes = decoratedMeshes(await initializeMeshRuntime(), prepared);
    const short = meshes.find((m) => m.vertices.every((p) => p[2] < 0.501));
    assert.ok(short);
    validateMesh(short);
    assert.ok(short.vertices.every((p) => Math.hypot(p[0], p[1]) < 5.001));
  } finally {
    owner.close();
  }
});
