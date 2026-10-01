import assert from "node:assert/strict";
import type { DocumentOwner } from "../src/backend/document-owner.js";
import type { LiftSource } from "../src/model/body.js";
import type { Loft } from "../src/model/loft.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

export function rectangle(z: number, size: number, x = 0): Sketch {
  const points = [
    [x - size, -size],
    [x + size, -size],
    [x + size, size],
    [x - size, size],
  ];
  return {
    ...emptySketch({ ...planes.XY, origin: [0, 0, z] }),
    curves: points.map(([x, y], i) => ({
      id: `e${i}`,
      kind: "segment",
      construction: false,
      a: { x, y },
      b: { x: points[(i + 1) % 4][0], y: points[(i + 1) % 4][1] },
    })),
  };
}
export function circle(z: number, radius: number, hole = 0): Sketch {
  return {
    ...emptySketch({ ...planes.XY, origin: [0, 0, z] }),
    curves: [
      { id: "outer", kind: "circle", center: { x: 0, y: 0 }, radius, construction: false },
      ...(hole
        ? [
            {
              id: "hole",
              kind: "circle" as const,
              center: { x: 0, y: 0 },
              radius: hole,
              construction: false,
            },
          ]
        : []),
    ],
  };
}
export async function draw(owner: DocumentOwner, sketch: Sketch): Promise<LiftSource> {
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  const profiles = profilesFor(sketch);
  const profile = profiles.find((p) => p.holes.length) ?? profiles[0];
  assert.ok(profile);
  return { sketch: sketch.id, profile: profile.key };
}
export async function preview(
  owner: DocumentOwner,
  sources: LiftSource[],
  changes: Partial<Loft> = {},
) {
  const reply = await owner.call({
    kind: "loft",
    operation: { sources, ruled: false, mode: "new", ...changes },
  });
  assert.equal(reply.error, undefined);
  const body = reply.view.candidate?.bodies?.at(-1);
  assert.ok(body);
  return body;
}
export function near(actual: number, expected: number, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}
