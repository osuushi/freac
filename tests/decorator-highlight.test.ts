import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { DecoratorDefinition } from "../src/decorators/definition.js";
import { JavaScriptDecorators } from "../src/decorators/javascript-hooks.js";
import { initializeDecoratorRuntime } from "../src/decorators/javascript-runtime.js";
import type { DecoratorInstance } from "../src/decorators/types.js";
import { roundBody } from "./decorator-domain-fixtures.js";

test("custom diagnostics validate face and edge highlights against selected bodies", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await roundBody(owner);
    const face = body.faces.find((f) => f.plane);
    assert.ok(face?.plane);
    const definition: DecoratorDefinition = JSON.parse(
      await readFile("examples/decorators/raised-pad.json", "utf8"),
    );
    const instance: DecoratorInstance = {
      id: "test",
      definition: definition.id,
      version: 1,
      faces: [{ body: body.id, face: face.id }],
      settings: { width: 20, height: 1 },
      frame: face.plane,
    };
    const runtime = await initializeDecoratorRuntime();
    const query = (source: string) => {
      const bundle = { ...definition, source };
      return new JavaScriptDecorators(runtime, [bundle]).diagnostics(
        { ...owner.view.data, decoratorDefinitions: [bundle] },
        instance,
      );
    };
    const diagnostics = query(definition.source);
    assert.deepEqual(
      diagnostics[0].edges,
      face.edges.map((edge) => ({ body: body.id, edge })),
    );
    for (const edges of [
      null,
      {},
      [null],
      [{ body: body.id, edge: "missing" }],
      [{ body: "other", edge: face.edges[0] }],
    ]) {
      assert.throws(
        () =>
          query(
            `export default { validate() { return [{ severity: "warning", message: "bad", edges: ${JSON.stringify(edges)} }]; } };`,
          ),
        /highlighted geometry/,
      );
    }
    assert.deepEqual(
      query(
        'export default { validate() { return [{ severity: "warning", message: "plain" }]; } };',
      ),
      [{ severity: "warning", message: "plain" }],
    );
  } finally {
    owner.close();
  }
});
