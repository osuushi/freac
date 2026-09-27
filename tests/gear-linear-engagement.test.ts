import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { gearMeshes } from "../src/decorators/gear-mesh.js";
import { gearOperands } from "../src/decorators/gear-runtime.js";
import { gearDefinition } from "../src/decorators/gear-settings.js";
import { initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { MeshScope } from "../src/decorators/mesh-scope.js";
import type { Body, Face } from "../src/model/body.js";
import { prism } from "./body-edge-fixtures.js";
import { roundBody } from "./decorator-domain-fixtures.js";

async function apply(
  owner: DocumentOwner,
  body: Body,
  face: Face,
  settings: Record<string, number>,
) {
  assert.equal(
    (
      await owner.call({
        kind: "decorator",
        edit: {
          action: "apply",
          definition: gearDefinition,
          faces: [{ body: body.id, face: face.id }],
          settings,
        },
      })
    ).error,
    undefined,
  );
  const instance = owner.view.data.decorators?.at(-1);
  assert.ok(instance);
  return instance;
}

test("internal ring and pinion remain clear over a tooth period", async () => {
  const owner = new DocumentOwner(),
    scope = new MeshScope(await initializeMeshRuntime());
  try {
    const pinion = await roundBody(owner, [5]);
    const pinionFace = pinion.faces.find((f) => f.cylinder);
    assert.ok(pinionFace);
    const pinionGear = await apply(owner, pinion, pinionFace, { teeth: 20, thinning: 0.03 });
    const ring = await roundBody(owner, [14, 10]);
    const ringFace = ring.faces.find((f) => f.cylinder?.outward === -1);
    assert.ok(ringFace);
    const ringGear = await apply(owner, ring, ringFace, { teeth: 40, thinning: 0.03 });
    const a = scope.from(gearMeshes(owner.view.data, pinionGear, "export").geometry.fill);
    const b = gearOperands(scope, owner.view.data, ringGear, "export").preview();
    for (let i = 0; i <= 12; i++) {
      const angle = (18 * i) / 12;
      const first = scope.keep(scope.keep(a.rotate([0, 0, angle])).translate([5, 0, 0]));
      const second = scope.keep(b.rotate([0, 0, angle / 2]));
      const volume = scope.keep(first.intersect(second)).volume();
      assert.ok(volume < 1e-5, `internal interference ${volume} at ${angle}`);
    }
  } finally {
    scope.close();
    owner.close();
  }
});

test("rack and pinion remain clear during coupled rotation and translation", async () => {
  const owner = new DocumentOwner(),
    scope = new MeshScope(await initializeMeshRuntime());
  try {
    const pinion = await roundBody(owner, [10]);
    const pinionFace = pinion.faces.find((f) => f.cylinder);
    assert.ok(pinionFace);
    const pinionGear = await apply(owner, pinion, pinionFace, { teeth: 40, thinning: 0.03 });
    const rack = await prism(owner, [
      [-15, -5],
      [15, -5],
      [15, 5],
      [-15, 5],
    ]);
    const rackFace = rack.faces.find(
      (f) => f.plane && f.vertices.every((n, i) => i % 3 !== 2 || Math.abs(n - 10) < 1e-7),
    );
    assert.ok(rackFace);
    const rackGear = await apply(owner, rack, rackFace, {
      module: 0.5,
      rackPhase: Math.PI / 4,
      thinning: 0.03,
    });
    const gear = scope.from(gearMeshes(owner.view.data, pinionGear, "export").geometry.fill);
    const rackMesh = gearOperands(scope, owner.view.data, rackGear, "export").preview();
    for (let i = 0; i <= 12; i++) {
      const angle = (9 * i) / 12;
      const rotated = scope.keep(scope.keep(gear.rotate([0, 0, angle])).rotate([90, 0, 0]));
      const moving = scope.keep(rotated.translate([(-10 * angle * Math.PI) / 180, 0, 20]));
      const volume = scope.keep(moving.intersect(rackMesh)).volume();
      assert.ok(volume < 1e-5, `rack interference ${volume} at ${angle}`);
    }
  } finally {
    scope.close();
    owner.close();
  }
});
