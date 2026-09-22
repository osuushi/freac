import assert from "node:assert/strict";
import type { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body, FaceMovement } from "../src/model/body.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

export async function feature(owner: DocumentOwner, kind: "hole" | "pocket" | "boss", x = 8) {
  const plane = {
    ...planes.XY,
    origin: [0, 0, kind === "hole" ? 0 : 10] as [number, number, number],
  };
  const points = [
    [x, 7],
    [x + 4, 7],
    [x + 4, 13],
    [x, 13],
  ];
  const sketch = {
    ...emptySketch(plane),
    curves:
      kind === "hole"
        ? [
            {
              id: "circle",
              kind: "circle" as const,
              center: { x: 10, y: 10 },
              radius: 2,
              construction: false,
            },
          ]
        : points.map(([x, y], i) => ({
            id: `side${i}`,
            kind: "segment" as const,
            a: { x, y },
            b: { x: points[(i + 1) % 4][0], y: points[(i + 1) % 4][1] },
            construction: false,
          })),
  };
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  const reply = await owner.call({
    kind: "extrude",
    extrusion: {
      sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
      distance: kind === "hole" ? 10 : kind === "pocket" ? -4 : 6,
      mode: kind === "boss" ? "union" : "subtract",
    },
  });
  assert.equal(reply.error, undefined);
  await owner.call({ kind: "accept" });
  const body = owner.view.data.bodies?.[0];
  assert.ok(body);
  return body;
}
export function selected(body: Body, kind: string) {
  return body.faces
    .filter((face) => {
      if (kind === "hole") return !!face.cylinder;
      return ![0, 1, 2].some((axis) =>
        [0, axis === 2 ? 10 : 20].some((value) =>
          face.vertices.every((n, i) => i % 3 !== axis || Math.abs(n - value) < 1e-6),
        ),
      );
    })
    .map((face) => ({ body: body.id, face: face.id }));
}
export function operation(body: Body, kind: string, distance: number): FaceMovement {
  return {
    faces: selected(body, kind),
    pivot: [10, 10, 10],
    axis: [0, 0, 1],
    angle: 0,
    translation: [distance, 0, 0],
  };
}
