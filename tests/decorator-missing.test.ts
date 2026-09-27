import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { JavaScriptDecorators } from "../src/decorators/javascript-hooks.js";
import { initializeDecoratorRuntime } from "../src/decorators/javascript-runtime.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { roundBody } from "./decorator-domain-fixtures.js";

test("missing bundled definitions survive reopening and block export until restored", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await roundBody(owner);
    const face = body.faces.find((f) => f.plane);
    assert.ok(face?.plane);
    const instance = {
      id: "missing-instance",
      definition: "example.missing",
      version: 1,
      faces: [{ body: body.id, face: face.id }],
      frame: face.plane,
      settings: { height: 2 },
    };
    const archive = documentArchive({ ...owner.view.data, decorators: [instance] });
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(archive) })).error,
      undefined,
    );
    const persisted = readArchive(archive).decorators;
    assert.deepEqual(owner.view.data.decorators, persisted);
    const reopened = documentArchive(owner.view.data);
    const query = {
      definition: instance.definition,
      version: 1,
      faces: instance.faces,
      instanceId: instance.id,
    };
    assert.match(
      (await owner.call({ kind: "decorator-inspect", query })).decoratorInspection?.reason ?? "",
      /Missing decorator/,
    );
    const prepared = (await owner.call({ kind: "export-geometry" })).exportDocument;
    assert.ok(prepared);
    const runtime = await initializeMeshRuntime();
    const javascript = await initializeDecoratorRuntime();
    assert.throws(
      () => decoratedMeshes(runtime, prepared, new JavaScriptDecorators(javascript)),
      /example\.missing \(missing-instance\): Missing decorator/,
    );
    assert.equal(documentArchive(owner.view.data), reopened);
    const definition = {
      id: instance.definition,
      version: 1,
      name: "Restored",
      fields: [{ key: "height", label: "Height", type: "number" as const, default: 1 }],
      source:
        "export default { partition(c) { return {groups:[{faces:c.selection}]}; }, validate() { return []; }, generate() { return []; } };",
    };
    assert.equal(
      (await owner.call({ kind: "decorator-definition", edit: { action: "install", definition } }))
        .error,
      undefined,
    );
    assert.equal(
      (await owner.call({ kind: "decorator-enable", id: definition.id, version: 1, enabled: true }))
        .error,
      undefined,
    );
    assert.equal(
      (await owner.call({ kind: "decorator-inspect", query })).decoratorInspection?.reason,
      null,
    );
    assert.equal(
      decoratedMeshes(
        runtime,
        owner.view.data,
        new JavaScriptDecorators(javascript, owner.view.decoratorSources),
      ).length,
      1,
    );
    assert.deepEqual(owner.view.data.decorators, persisted);
  } finally {
    owner.close();
  }
});
