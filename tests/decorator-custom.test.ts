import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { DecoratorDefinition } from "../src/decorators/definition.js";
import { JavaScriptDecorators } from "../src/decorators/javascript-hooks.js";
import { initializeDecoratorRuntime } from "../src/decorators/javascript-runtime.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { validateMesh } from "../src/model/export-mesh.js";
import { encodeMeshes } from "../src/model/mesh-export.js";
import { roundBody } from "./decorator-domain-fixtures.js";

test("bundled custom decorator applies, edits, previews and exports through the owner and mesh pipeline", async () => {
  const owner = new DocumentOwner();
  const definition: DecoratorDefinition = JSON.parse(
    await readFile("examples/decorators/raised-pad.json", "utf8"),
  );
  try {
    const body = await roundBody(owner);
    const cap = body.faces.find((f) => f.plane && Math.abs(f.signature[5] - 10) < 1e-7);
    assert.ok(cap);
    assert.equal(
      (await owner.call({ kind: "decorator-definition", edit: { action: "install", definition } }))
        .error,
      undefined,
    );
    const edit = {
      action: "apply" as const,
      definition: definition.id,
      faces: [{ body: body.id, face: cap.id }],
    };
    assert.match(
      (await owner.call({ kind: "decorator", edit })).error ?? "",
      /Enable bundled code/,
    );
    await owner.call({ kind: "decorator-enable", id: definition.id, version: 1, enabled: true });
    assert.equal((await owner.call({ kind: "decorator", edit })).error, undefined);
    const instance = owner.view.data.decorators?.[0];
    assert.ok(instance);
    const applied = documentArchive(owner.view.data);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "settings", ids: [instance.id], patch: { height: 2 } },
        })
      ).error,
      undefined,
    );
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), applied);
    await owner.call({ kind: "redo" });
    const javascript = await initializeDecoratorRuntime();
    const hooks = new JavaScriptDecorators(javascript, owner.view.decoratorSources);
    const current = owner.view.data.decorators?.[0];
    assert.ok(current);
    await assertReadOnlyInspection(owner, body, current);
    assert.equal(hooks.preview(owner.view.data, current)?.triangles.length, 12);
    const prepared = (await owner.call({ kind: "export-geometry" })).exportDocument;
    assert.ok(prepared);
    const manifold = await initializeMeshRuntime();
    const meshes = decoratedMeshes(manifold, prepared, hooks);
    validateMesh(meshes[0]);
    assert.ok(
      meshes[0].vertices.some((p) => p[2] > 11.99),
      "custom generated pad must reach its requested height",
    );
    for (const format of ["stl", "3mf"] as const)
      assert.ok(encodeMeshes(meshes, format).length > 100);
    const archive = documentArchive(owner.view.data);
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(archive) })).error,
      undefined,
    );
    assert.equal(owner.view.decoratorSources?.length, 0);
    assert.throws(
      () => decoratedMeshes(manifold, owner.view.data, new JavaScriptDecorators(javascript, [])),
      /Enable bundled code/,
    );
  } finally {
    owner.close();
  }
});

async function assertReadOnlyInspection(
  owner: DocumentOwner,
  body: import("../src/model/body.js").Body,
  current: import("../src/decorators/types.js").DecoratorInstance,
): Promise<void> {
  const unchanged = documentArchive(owner.view.data);
  const cylinder = body.faces.find((f) => f.cylinder);
  assert.ok(cylinder);
  const rejected = await owner.call({
    kind: "decorator-inspect",
    query: {
      definition: current.definition,
      version: 1,
      faces: [{ body: body.id, face: cylinder.id }],
    },
  });
  assert.match(rejected.decoratorInspection?.reason ?? "", /planar faces/);
  const eligible = await owner.call({
    kind: "decorator-inspect",
    query: {
      definition: current.definition,
      version: 1,
      faces: [...current.faces],
      instanceId: current.id,
    },
  });
  assert.equal(eligible.decoratorInspection?.reason, null);
  assert.equal(
    documentArchive(owner.view.data),
    unchanged,
    "inspection must not edit the document",
  );
}
