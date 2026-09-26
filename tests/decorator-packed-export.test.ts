import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { exportMesh, validateMesh } from "../src/model/export-mesh.js";
import { encodeMeshes } from "../src/model/mesh-export.js";
import type { SketchDocument } from "../src/sketch/document.js";

// Focused body and decorator from the founder's 2026-09-26 Capture fixture.
const fixture = JSON.parse(readFileSync("tests/fixtures/thread-boolean-sliver.json", "utf8")) as {
  document: SketchDocument;
};

test("a tilted threaded hole exports after its zero-thickness Boolean facets collapse", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const prepared = await owner.call({ kind: "export-geometry" });
    assert.equal(prepared.error, undefined);
    assert.ok(prepared.exportDocument);
    const body = prepared.exportDocument.bodies?.[0];
    assert.ok(body);
    validateMesh(exportMesh(body));
    const meshes = decoratedMeshes(await initializeMeshRuntime(), prepared.exportDocument);
    assert.equal(meshes.length, 1);
    validateMesh(meshes[0]);
    assert.ok(encodeMeshes(meshes, "3mf").length > 1000);
  } finally {
    owner.close();
  }
});
