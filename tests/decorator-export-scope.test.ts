import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import { exportMesh, validateMesh } from "../src/model/export-mesh.js";
import { roundBody } from "./decorator-domain-fixtures.js";

test("export only prepares visible body IDs and their decorators", async () => {
  const owner = new DocumentOwner();
  try {
    const threaded = await roundBody(owner, [5]);
    const plain = await roundBody(owner, [8]);
    const face = threaded.faces.find((candidate) => candidate.cylinder)?.id;
    assert.ok(face);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: threadDefinition,
            faces: [{ body: threaded.id, face }],
          },
        })
      ).error,
      undefined,
    );
    const before = owner.view.data;
    const scoped = await owner.call({ kind: "export-geometry", bodyIds: [plain.id] });
    assert.equal(scoped.error, undefined);
    assert.ok(scoped.exportDocument);
    assert.deepEqual(
      scoped.exportDocument?.bodies?.map((body) => body.id),
      [plain.id],
    );
    assert.equal(scoped.exportDocument.decorators?.length, 0);
    const exported = scoped.exportDocument.bodies?.[0];
    assert.ok(exported);
    validateMesh(exportMesh(exported));
    assert.equal(owner.view.data, before);
    assert.equal(owner.view.canUndo, true);
  } finally {
    owner.close();
  }
});
