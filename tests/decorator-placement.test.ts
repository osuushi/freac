import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import {
  threadDefinition,
  threadDepth,
  threadSettings,
} from "../src/decorators/thread-settings.js";
import { validateMesh } from "../src/model/export-mesh.js";
import { encodeMeshes } from "../src/model/mesh-export.js";
import { roundBody } from "./decorator-domain-fixtures.js";

test("distant thread placement retains local precision in 3MF and rejects insufficient STL precision", async () => {
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
            settings: { cut: "hole" },
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
            translation: [1e6, -1e6, 1e6],
            pivot: [0, 0, 0],
            axis: [0, 0, 1],
            angle: 0,
            duplicate: false,
          },
        })
      ).error,
      undefined,
    );
    const reply = await owner.call({ kind: "export-geometry" });
    assert.equal(reply.error, undefined);
    assert.ok(reply.exportDocument);
    const mesh = decoratedMeshes(await initializeMeshRuntime(), reply.exportDocument)[0];
    const instance = reply.exportDocument.decorators?.[0];
    assert.ok(instance);
    const settings = threadSettings(instance.settings);
    validateMesh(mesh);
    let maximum = 0;
    for (const p of mesh.vertices) {
      const radius = Math.hypot(p[0] - 1e6, p[1] + 1e6);
      maximum = Math.max(maximum, radius);
      assert.ok(radius <= 5 + threadDepth(settings) + settings.clearance + 0.008);
      assert.ok(p[2] >= 1e6 - 1e-5 && p[2] <= 1e6 + 10.00001);
    }
    assert.ok(maximum > 5.8);
    assert.ok(encodeMeshes([mesh], "3mf").length > 100);
    assert.throws(() => encodeMeshes([mesh], "stl"), /STL precision/);
  } finally {
    owner.close();
  }
});
