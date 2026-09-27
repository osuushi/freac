import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { knurlDefinition } from "../src/decorators/builtins.js";
import { knurlRadius } from "../src/decorators/knurl-mesh.js";
import {
  knurlDimensions,
  knurlSettings,
  patchKnurlSettings,
} from "../src/decorators/knurl-settings.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { validateMesh } from "../src/model/export-mesh.js";
import { encodeMeshes } from "../src/model/mesh-export.js";
import { planes } from "../src/sketch/planes.js";
import { retainHalf, roundBody } from "./decorator-domain-fixtures.js";

test("knurl presets resolve explicit dimensions and diamond closes its seam", () => {
  const settings = patchKnurlSettings({}, { preset: "fdm-coarse" });
  assert.equal(settings.spacing, 3.6);
  assert.equal(settings.depth, 0.6);
  assert.equal(patchKnurlSettings(settings, { depth: 0.3 }).preset, "custom");
  assert.equal(patchKnurlSettings(settings, { mode: "raised" }).preset, "fdm-coarse");
  const { pitch } = knurlDimensions(5, settings);
  assert.equal(knurlRadius(5, 0, 0, settings, 1), 4.4);
  assert.equal(knurlRadius(5, 0, pitch / 2, settings, 1), 5);
  for (let z = -3; z < 3; z += 0.17)
    assert.ok(
      Math.abs(knurlRadius(5, 0, z, settings, 1) - knurlRadius(5, 2 * Math.PI, z, settings, 1)) <
        1e-10,
    );
  assert.throws(() => knurlSettings({ spacing: NaN }));
});

test("knurling persists settings, owner Undo/Redo and split continuation", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await roundBody(owner);
    const faces = body.faces.filter((f) => f.cylinder).map((f) => ({ body: body.id, face: f.id }));
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "apply", definition: knurlDefinition, faces },
        })
      ).error,
      undefined,
    );
    const original = owner.view.data.decorators?.[0];
    assert.ok(original);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "settings", ids: [original.id], patch: { preset: "resin" } },
        })
      ).error,
      undefined,
    );
    assert.equal(owner.view.data.decorators?.[0].settings.depth, 0.2);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data.decorators?.[0], original);
    await owner.call({ kind: "redo" });
    const archive = documentArchive(owner.view.data);
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(archive) })).error,
      undefined,
    );
    assert.deepEqual(owner.view.data.decorators, readArchive(archive).decorators);
    await retainHalf(
      owner,
      owner.view.data.bodies?.[0] ?? body,
      { ...planes.YZ, origin: [2, 0, 0] },
      (b) => b.center[0] < 2,
    );
    assert.equal(owner.view.data.decorators?.length, 1);
    assert.equal(owner.view.data.decorators?.[0].problem, undefined);
    assert.deepEqual(owner.view.data.decorators?.[0].frame, original.frame);
  } finally {
    owner.close();
  }
});

for (const partial of [false, true])
  for (const internal of [false, true])
    for (const mode of ["recessed", "raised"] as const) {
      test(`knurl export ${partial ? "partial" : "full"} ${internal ? "internal" : "external"} ${mode}`, async () => {
        const owner = new DocumentOwner();
        try {
          let body = await roundBody(owner, internal ? [7, 5] : [5], 4);
          if (partial)
            body = await retainHalf(
              owner,
              body,
              { ...planes.YZ, origin: [2, 0, 0] },
              (b) => b.center[0] < 2,
            );
          const faces = body.faces
            .filter((f) => f.cylinder && Math.abs(f.cylinder.radius - 5) < 1e-7)
            .map((f) => ({ body: body.id, face: f.id }));
          assert.equal(
            (
              await owner.call({
                kind: "decorator",
                edit: { action: "apply", definition: knurlDefinition, faces, settings: { mode } },
              })
            ).error,
            undefined,
          );
          const archive = documentArchive(owner.view.data);
          const prepared = await owner.call({ kind: "export-geometry" });
          assert.equal(prepared.error, undefined);
          assert.ok(prepared.exportDocument);
          const meshes = decoratedMeshes(await initializeMeshRuntime(), prepared.exportDocument);
          validateMesh(meshes[0]);
          assert.ok(encodeMeshes(meshes, "stl").length > 84);
          assert.ok(encodeMeshes(meshes, "3mf").length > 100);
          const vertices = meshes[0].vertices;
          if (partial) for (const p of vertices) assert.ok(p[0] <= 2.00001, `Crossed flat: ${p}`);
          const side = vertices
            .filter((p) => p[2] > 0.05 && p[2] < 3.95 && (!partial || p[0] < 1.9))
            .map((p) => Math.hypot(p[0], p[1]));
          if (!internal && mode === "raised") assert.ok(side.some((r) => r > 5.35));
          if (!internal && mode === "recessed") assert.ok(side.some((r) => r < 4.65));
          if (internal && mode === "raised") assert.ok(side.some((r) => r < 4.65));
          if (internal && mode === "recessed") assert.ok(side.some((r) => r > 5.35 && r < 6));
          for (const p of vertices) assert.ok(p[2] >= -1e-5 && p[2] <= 4.00001);
          assert.equal(documentArchive(owner.view.data), archive);
        } finally {
          owner.close();
        }
      });
    }
