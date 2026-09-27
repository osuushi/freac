import assert from "node:assert/strict";
import type { DocumentOwner } from "../src/backend/document-owner.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import type { Body } from "../src/model/body.js";
import { emptySketch } from "../src/sketch/document.js";
import { type PlaneFrame, planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

export async function roundBody(owner: DocumentOwner, radii = [5], distance = 10): Promise<Body> {
  const sketch = {
    ...emptySketch(planes.XY),
    curves: radii.map((radius, i) => ({
      id: `circle${i}`,
      kind: "circle" as const,
      radius,
      center: { x: 0, y: 0 },
      construction: false,
    })),
  };
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  assert.equal(
    (
      await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
          distance,
          mode: "new",
        },
      })
    ).error,
    undefined,
  );
  await owner.call({ kind: "accept" });
  const body = owner.view.data.bodies?.at(-1);
  assert.ok(body);
  return body;
}

export async function retainHalf(
  owner: DocumentOwner,
  body: Body,
  frame: PlaneFrame,
  keep: (body: Body) => boolean,
): Promise<Body> {
  assert.equal(
    (
      await owner.call({
        kind: "plane-cut",
        operation: {
          mode: "split",
          targets: [{ body: body.id }],
          frame,
        },
      })
    ).error,
    undefined,
  );
  assert.equal((await owner.call({ kind: "accept" })).error, undefined);
  const kept = owner.view.data.bodies?.find(keep);
  assert.ok(kept);
  assert.equal(
    (
      await owner.call({
        kind: "delete-entities",
        sketchIds: [],
        bodyIds: (owner.view.data.bodies ?? []).filter((b) => b !== kept).map((b) => b.id),
      })
    ).error,
    undefined,
  );
  return kept;
}

export async function threadedExport(
  owner: DocumentOwner,
  body: Body,
  radius: number,
  cut: "rod" | "hole",
) {
  const refs = body.faces
    .filter((f) => f.cylinder && Math.abs(f.cylinder.radius - radius) < 1e-7)
    .map((f) => ({ body: body.id, face: f.id }));
  assert.ok(refs.length);
  assert.equal(
    (
      await owner.call({
        kind: "decorator",
        edit: {
          action: "apply",
          definition: threadDefinition,
          faces: refs,
          settings: { cut },
        },
      })
    ).error,
    undefined,
  );
  const result = await owner.call({ kind: "export-geometry" });
  assert.equal(result.error, undefined);
  assert.ok(result.exportDocument);
  return decoratedMeshes(await initializeMeshRuntime(), result.exportDocument)[0];
}
