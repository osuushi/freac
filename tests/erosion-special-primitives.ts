import assert from "node:assert/strict";
import type { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body, BooleanMode } from "../src/model/body.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { type PlaneFrame, planes, type Vector } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

export async function extruded(owner: DocumentOwner, sketch: Sketch, distance: number) {
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  const reply = await owner.call({
    kind: "extrude",
    extrusion: {
      sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
      distance,
      mode: "new",
    },
  });
  assert.equal(reply.error, undefined);
  await owner.call({ kind: "accept" });
  return owner.view.data.bodies?.at(-1) as Body;
}
export async function box(owner: DocumentOwner, origin: Vector, size: Vector) {
  const [x, y, z] = origin,
    [dx, dy, dz] = size;
  const points = [
    [x, y],
    [x + dx, y],
    [x + dx, y + dy],
    [x, y + dy],
  ];
  return extruded(
    owner,
    {
      ...emptySketch({ ...planes.XY, origin: [0, 0, z] }),
      curves: points.map(([x, y], i) => ({
        id: `edge${i}`,
        kind: "segment",
        a: { x, y },
        b: { x: points[(i + 1) % 4][0], y: points[(i + 1) % 4][1] },
        construction: false,
      })),
    },
    dz,
  );
}
export async function cylinder(
  owner: DocumentOwner,
  radius: number,
  height: number,
  frame: PlaneFrame = planes.XY,
) {
  return extruded(
    owner,
    {
      ...emptySketch(frame),
      curves: [
        { id: "circle", kind: "circle", center: { x: 0, y: 0 }, radius, construction: false },
      ],
    },
    height,
  );
}
async function revolved(owner: DocumentOwner, sketch: Sketch, center: Vector) {
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  const reply = await owner.call({
    kind: "revolve",
    revolution: {
      sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
      axis: { origin: center, direction: [0, 0, 1] },
      angle: 360,
      height: 0,
      mode: "new",
    },
  });
  assert.equal(reply.error, undefined);
  await owner.call({ kind: "accept" });
  return owner.view.data.bodies?.at(-1) as Body;
}
export async function sphere(owner: DocumentOwner, radius: number, center: Vector = [0, 0, 0]) {
  return revolved(
    owner,
    {
      ...emptySketch({ ...planes.XZ, origin: center }),
      curves: [
        {
          id: "arc",
          kind: "arc",
          a: { x: 0, y: -radius },
          b: { x: 0, y: radius },
          bulge: 1,
          construction: false,
        },
        {
          id: "axis",
          kind: "segment",
          a: { x: 0, y: radius },
          b: { x: 0, y: -radius },
          construction: false,
        },
      ],
    },
    center,
  );
}
export async function torus(
  owner: DocumentOwner,
  major: number,
  minor: number,
  center: Vector = [0, 0, 0],
) {
  return revolved(
    owner,
    {
      ...emptySketch({ ...planes.XZ, origin: center }),
      curves: [
        {
          id: "circle",
          kind: "circle",
          center: { x: major, y: 0 },
          radius: minor,
          construction: false,
        },
      ],
    },
    center,
  );
}
export async function combine(
  owner: DocumentOwner,
  bodies: Body[],
  mode: Exclude<BooleanMode, "new">,
) {
  const reply = await owner.call({
    kind: "boolean-bodies",
    operation: {
      ids: bodies.map((body) => body.id),
      mode,
      keepOriginals: false,
    },
  });
  assert.equal(reply.error, undefined);
  await owner.call({ kind: "accept" });
  assert.equal(owner.view.data.bodies?.length, 1, "Special-case source must be one connected body");
  return owner.view.data.bodies[0];
}
export async function roundedCircle(owner: DocumentOwner, body: Body, z: number, size: number) {
  const edge = body.edges.find(
    (edge) => edge.curve?.kind === "circle" && Math.abs(edge.curve.center[2] - z) < 1e-5,
  );
  assert.ok(edge, `Circular join at z=${z}`);
  const reply = await owner.call({
    kind: "finish-edges",
    operation: {
      edges: [{ body: body.id, edge: edge.id }],
      mode: "fillet",
      size,
    },
  });
  assert.equal(reply.error, undefined);
  await owner.call({ kind: "accept" });
  return owner.view.data.bodies?.[0] as Body;
}
