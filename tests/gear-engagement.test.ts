import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { gearMeshes } from "../src/decorators/gear-mesh.js";
import { gearDefinition } from "../src/decorators/gear-settings.js";
import { initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { MeshScope } from "../src/decorators/mesh-scope.js";
import { roundBody } from "./decorator-domain-fixtures.js";

test("opposite-hand helicals have no interference through a tooth period", async () => {
  const owner = new DocumentOwner(),
    scope = new MeshScope(await initializeMeshRuntime());
  try {
    const body = await roundBody(owner, [10]);
    const face = body.faces.find((f) => f.cylinder);
    assert.ok(face);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: gearDefinition,
            faces: [{ body: body.id, face: face.id }],
            settings: { helix: 25, thinning: 0.03 },
          },
        })
      ).error,
      undefined,
    );
    const instance = owner.view.data.decorators?.[0];
    assert.ok(instance);
    const a = scope.from(gearMeshes(owner.view.data, instance, "export").geometry.fill);
    const b = scope.from(
      gearMeshes(
        owner.view.data,
        { ...instance, settings: { ...instance.settings, hand: "left", phase: 4.5 } },
        "export",
      ).geometry.fill,
    );
    for (let i = 0; i <= 8; i++) {
      const angle = (9 * i) / 8;
      const first = scope.keep(a.rotate([0, 0, angle]));
      const second = scope.keep(scope.keep(b.rotate([0, 0, -angle])).translate([20, 0, 0]));
      assert.ok(
        scope.keep(first.intersect(second)).volume() < 1e-5,
        `helical interference at ${angle}`,
      );
    }
  } finally {
    scope.close();
    owner.close();
  }
});

test("spherical-involute bevel pair has no interference over a tooth period", async () => {
  const owner = new DocumentOwner(),
    scope = new MeshScope(await initializeMeshRuntime());
  try {
    const body = await roundBody(owner, [10]);
    const face = body.faces.find((f) => f.cylinder);
    assert.ok(face);
    owner.beginScript("bevel fixture");
    await owner.scripts.step({
      kind: "replaceFace",
      input: {
        body: body.id,
        face: face.id,
        surface: { kind: "cone", origin: [0, 0, 0], axis: [0, 0, 1], radius: 10, semiAngle: 45 },
      },
    });
    owner.scripts.finish();
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: gearDefinition,
            faces: [{ body: body.id, face: face.id }],
            settings: { thinning: 0.03 },
          },
        })
      ).error,
      undefined,
    );
    const instance = owner.view.data.decorators?.[0];
    assert.ok(instance);
    const profile = scope.keep(
      scope
        .from(gearMeshes(owner.view.data, instance, "export").geometry.fill)
        .translate([0, 0, 10]),
    );
    for (let i = 0; i <= 12; i++) {
      const angle = (9 * i) / 12;
      const first = scope.keep(profile.rotate([0, 0, angle]));
      const second = scope.keep(scope.keep(profile.rotate([0, 0, 4.5 - angle])).rotate([0, 90, 0]));
      const volume = scope.keep(first.intersect(second)).volume();
      assert.ok(volume < 1e-5, `bevel interference ${volume} at ${angle}`);
    }
  } finally {
    scope.close();
    owner.close();
  }
});
