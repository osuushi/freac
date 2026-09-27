import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { knurlDefinition } from "../src/decorators/builtins.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import { validateMesh } from "../src/model/export-mesh.js";
import type { Vector } from "../src/sketch/planes.js";
import { retainHalf, roundBody } from "./decorator-domain-fixtures.js";

for (const preset of ["fdm-fine", "fdm-coarse", "resin"]) {
  test(`${preset} knurling respects a sloped trimmed cap`, async () => {
    const owner = new DocumentOwner();
    try {
      const body = await retainHalf(
        owner,
        await roundBody(owner, [3], 4),
        {
          origin: [0, 0, 2],
          u: [2 / Math.sqrt(5), 0, -1 / Math.sqrt(5)] as Vector,
          v: [0, 1, 0],
        },
        (b) => b.center[2] < 2,
      );
      const faces = body.faces
        .filter((f) => f.cylinder)
        .map((f) => ({ body: body.id, face: f.id }));
      assert.equal(
        (
          await owner.call({
            kind: "decorator",
            edit: {
              action: "apply",
              definition: knurlDefinition,
              faces,
              settings: { preset, mode: "raised" },
            },
          })
        ).error,
        undefined,
      );
      const result = await owner.call({ kind: "export-geometry" });
      assert.ok(result.exportDocument);
      const mesh = decoratedMeshes(await initializeMeshRuntime(), result.exportDocument)[0];
      validateMesh(mesh);
      for (const p of mesh.vertices) {
        assert.ok(p[2] + p[0] / 2 <= 2.00001, `Knurl crossed sloped cap: ${p}`);
        assert.ok(p[2] >= -1e-5);
      }
      assert.ok(mesh.vertices.some((p) => Math.hypot(p[0], p[1]) > 3.15));
    } finally {
      owner.close();
    }
  });
}

test("knurl selection rejects planes/conflicting decorators atomically and supports inspection", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await roundBody(owner);
    const faces = body.faces.map((f) => ({ body: body.id, face: f.id }));
    const mixed = await owner.call({
      kind: "decorator",
      edit: { action: "apply", definition: knurlDefinition, faces },
    });
    assert.match(mixed.error ?? "", /cylindrical/);
    assert.equal(owner.view.data.decorators?.length ?? 0, 0);
    const curved = body.faces.filter((f) => f.cylinder).map((f) => ({ body: body.id, face: f.id }));
    const inspection = await owner.call({
      kind: "decorator-inspect",
      query: { definition: knurlDefinition, version: 1, faces: curved },
    });
    assert.equal(inspection.decoratorInspection?.reason, null);
    assert.equal(inspection.decoratorInspection?.groups.length, 1);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "apply", definition: threadDefinition, faces: curved },
        })
      ).error,
      undefined,
    );
    assert.match(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "apply", definition: knurlDefinition, faces: curved },
        })
      ).error ?? "",
      /Remove the existing/,
    );
    assert.equal(owner.view.data.decorators?.[0].definition, threadDefinition);
  } finally {
    owner.close();
  }
});
