import assert from "node:assert/strict";
import type { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";
import { planes } from "../src/sketch/planes.js";
import { prism } from "./body-edge-fixtures.js";
import {
  box,
  combine,
  cylinder,
  roundedCircle,
  sphere,
  torus,
} from "./erosion-special-primitives.js";

export type ErosionCase = {
  name: string;
  build: (owner: DocumentOwner) => Promise<Body>;
  thickness: number;
  allowance: number;
  count?: number;
  volume?: number;
};
async function hemisphere(owner: DocumentOwner, fillet = false) {
  const ball = await sphere(owner, 8);
  const half = await box(owner, [-10, -10, 0], [20, 20, 10]);
  const result = await combine(owner, [ball, half], "intersect");
  return fillet ? roundedCircle(owner, result, 0, 0.75) : result;
}
async function bulb(owner: DocumentOwner, fillet = false) {
  const ball = await sphere(owner, 6);
  const stem = await cylinder(owner, 3, 10, { ...planes.XY, origin: [0, 0, -10] });
  const result = await combine(owner, [ball, stem], "union");
  assert.ok(result.volume > ball.volume + 50, "The source must retain its cylindrical stem");
  return fillet ? roundedCircle(owner, result, -Math.sqrt(27), 0.75) : result;
}
async function cavities(owner: DocumentOwner, centers: number[], radius: number) {
  const block = await box(owner, [0, 0, 0], [20, 20, 20]);
  const holes: Body[] = [];
  for (const x of centers) holes.push(await sphere(owner, radius, [x, 10, 10]));
  return combine(owner, [block, ...holes], "subtract");
}
async function hollowSphere(owner: DocumentOwner) {
  return combine(owner, [await sphere(owner, 8), await sphere(owner, 6)], "subtract");
}
const ballVolume = (radius: number) => (4 * Math.PI * radius ** 3) / 3;
export const erosionSpecialCases: ErosionCase[] = [
  {
    name: "long-thin-fin",
    thickness: 1,
    allowance: 0.25,
    build: (owner) =>
      prism(owner, [
        [0, 0],
        [20, 0],
        [20, 9.5],
        [35, 9.5],
        [35, 10.5],
        [20, 10.5],
        [20, 20],
        [0, 20],
      ]),
  },
  {
    name: "thin-round-branch",
    thickness: 1,
    allowance: 0.25,
    build: async (owner) => {
      const result = await combine(
        owner,
        [
          await cylinder(owner, 6, 10),
          await cylinder(owner, 0.6, 12, { ...planes.YZ, origin: [0, 0, 5] }),
        ],
        "union",
      );
      assert.ok(result.volume > Math.PI * 36 * 10 + 5, "The source must retain its thin branch");
      return result;
    },
  },
  {
    name: "torus",
    thickness: 1,
    allowance: 0.25,
    build: (owner) => torus(owner, 8, 3),
    volume: 64 * Math.PI ** 2,
  },
  {
    name: "double-torus",
    thickness: 0.8,
    allowance: 0.6,
    build: async (owner) => {
      const result = await combine(
        owner,
        [await torus(owner, 8, 3), await torus(owner, 8, 3, [18, 0, 0])],
        "union",
      );
      assert.ok(result.volume > 2600 && result.volume < 2800);
      assert.ok(Math.abs(result.center[0] - 9) < 1e-6, "Both torus lobes must be present");
      return result;
    },
  },
  {
    name: "two-bore-plate",
    thickness: 1,
    allowance: 0.25,
    build: async (owner) =>
      combine(
        owner,
        [
          await box(owner, [0, 0, 0], [30, 20, 10]),
          await cylinder(owner, 2, 10, { ...planes.XY, origin: [10, 10, 0] }),
          await cylinder(owner, 2, 10, { ...planes.XY, origin: [20, 10, 0] }),
        ],
        "subtract",
      ),
    volume: 28 * 18 * 8 - 2 * Math.PI * 9 * 8,
  },
  {
    name: "sphere-plane",
    thickness: 1,
    allowance: 0.25,
    build: (owner) => hemisphere(owner),
    volume: 180 * Math.PI,
  },
  {
    name: "sphere-plane-fillet",
    thickness: 1,
    allowance: 0.5,
    build: (owner) => hemisphere(owner, true),
  },
  { name: "sphere-cylinder", thickness: 0.8, allowance: 0.3, build: (owner) => bulb(owner) },
  {
    name: "sphere-cylinder-fillet",
    thickness: 0.8,
    allowance: 0.3,
    build: (owner) => bulb(owner, true),
  },
  {
    name: "tiny-sealed-cavity",
    thickness: 1,
    allowance: 0.25,
    build: (owner) => cavities(owner, [10], 0.2),
    volume: 18 ** 3 - ballVolume(1.2),
  },
  {
    name: "two-sealed-cavities",
    thickness: 1,
    allowance: 0.25,
    build: (owner) => cavities(owner, [7, 13], 0.4),
    volume: 18 ** 3 - 2 * ballVolume(1.4),
  },
  {
    name: "merging-cavities",
    thickness: 1.7,
    allowance: 0.25,
    build: (owner) => cavities(owner, [8, 12], 0.5),
    volume: 16.6 ** 3 - 2 * ballVolume(2.2) + (Math.PI * (4 * 2.2 + 4) * (2 * 2.2 - 4) ** 2) / 12,
  },
  {
    name: "cavity-breakthrough",
    thickness: 0.8,
    allowance: 0.25,
    build: (owner) => cavities(owner, [1.8], 0.8),
    volume: 18.4 ** 3 - ballVolume(1.6) + Math.PI * 0.6 ** 2 * (1.6 - 0.6 / 3),
  },
  {
    name: "hollow-sphere",
    thickness: 0.5,
    allowance: 0.2,
    build: hollowSphere,
    volume: ballVolume(7.5) - ballVolume(6.5),
  },
  {
    name: "hollow-sphere-collapse",
    thickness: 1.1,
    allowance: 0.2,
    build: hollowSphere,
    count: 0,
    volume: 0,
  },
  {
    name: "thin-torus",
    thickness: 2.8,
    allowance: 0.1,
    build: (owner) => torus(owner, 8, 3),
    volume: 2 * Math.PI ** 2 * 8 * 0.2 ** 2,
  },
  {
    name: "torus-collapse",
    thickness: 3.1,
    allowance: 0.2,
    build: (owner) => torus(owner, 8, 3),
    count: 0,
    volume: 0,
  },
];
