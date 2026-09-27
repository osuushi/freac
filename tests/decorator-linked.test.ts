import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { DecoratorDefinition } from "../src/decorators/definition.js";
import { JavaScriptDecorators } from "../src/decorators/javascript-hooks.js";
import { initializeDecoratorRuntime } from "../src/decorators/javascript-runtime.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { validateMesh } from "../src/model/export-mesh.js";
import { roundBody } from "./decorator-domain-fixtures.js";

test("custom continuation preserves one instance and generates both linked pads", async () => {
  const owner = new DocumentOwner();
  try {
    const definition: DecoratorDefinition = JSON.parse(
      await readFile("examples/decorators/linked-pads.json", "utf8"),
    );
    const body = await roundBody(owner);
    const faces = body.faces.filter((f) => f.plane).map((f) => ({ body: body.id, face: f.id }));
    assert.equal(faces.length, 2);
    await owner.call({ kind: "decorator-definition", edit: { action: "install", definition } });
    await owner.call({ kind: "decorator-enable", id: definition.id, version: 1, enabled: true });
    await owner.call({
      kind: "decorator",
      edit: { action: "apply", definition: definition.id, faces: [faces[0]] },
    });
    const original = owner.view.data.decorators?.[0];
    assert.ok(original);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "continue", id: original.id, faces: [faces[1]] },
        })
      ).error,
      undefined,
    );
    assert.equal(owner.view.data.decorators?.length, 1);
    assert.equal(owner.view.data.decorators[0].faces.length, 2);
    assert.deepEqual(owner.view.data.decorators[0].settings, original.settings);
    const snapshot = (await owner.call({ kind: "export-geometry" })).exportDocument;
    assert.ok(snapshot);
    const hooks = new JavaScriptDecorators(
      await initializeDecoratorRuntime(),
      owner.view.decoratorSources,
    );
    const mesh = decoratedMeshes(await initializeMeshRuntime(), snapshot, hooks)[0];
    validateMesh(mesh);
    assert.ok(
      mesh.vertices.some((p) => p[2] < -0.999),
      "bottom pad must grow outward",
    );
    assert.ok(
      mesh.vertices.some((p) => p[2] > 10.999),
      "top pad must grow outward",
    );
    await owner.call({ kind: "decorator", edit: { action: "remove", faces: [faces[1]] } });
    assert.equal(owner.view.data.decorators?.[0].faces.length, 1);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data.decorators?.[0].faces.length, 2);
  } finally {
    owner.close();
  }
});
