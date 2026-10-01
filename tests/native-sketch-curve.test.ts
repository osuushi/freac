import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import type { KernelResult } from "../src/backend/kernel-result.js";
import { NativeCalculator } from "../src/backend/native-calculator.js";
import { planes } from "../src/sketch/planes.js";

const circle = { kind: "circle", center: [0, 0, 0], normal: [0, 0, 1], axis: [1, 0, 0], radius: 1 };
const closingLine = { kind: "line", a: [1, 0, 0], b: [-1, 0, 0] };
function request(kind: "project" | "extrude", curve: object) {
  return kind === "project"
    ? { kind, bodies: [], frame: planes.XY, edges: [], curves: [curve] }
    : {
        kind,
        bodies: [],
        mode: "new",
        distance: 2,
        normal: [0, 0, 1],
        profiles: [{ outer: [curve, closingLine], holes: [] }],
      };
}
for (const kind of ["project", "extrude"] as const)
  test(`native ${kind} uses the same explicit curve decoder and survives invalid inputs`, async () => {
    const calculator = new NativeCalculator<object, KernelResult & { curves: { kind: string }[] }>(
      resolve(".build/kernel/bin/freac-kernel"),
      "Curve decoder probe",
    );
    try {
      await assert.rejects(
        calculator.calculate(
          request(kind, {
            kind: "unknown",
            a: [-1, 0, 0],
            mid: [0, 1, 0],
            b: [1, 0, 0],
          }),
        ),
        /Unknown sketch curve kind/,
      );
      await assert.rejects(
        calculator.calculate(
          request(kind, {
            kind: "arc",
            a: [-1, 0, 0],
            mid: [0, 0, 0],
            b: [1, 0, 0],
          }),
        ),
        /Cannot construct circular sketch span/,
      );
      // A following calculation on the same stateless process must still work.
      const valid =
        kind === "project"
          ? request(kind, circle)
          : { ...request(kind, circle), profiles: [{ outer: [circle], holes: [] }] };
      const result = await calculator.calculate(valid);
      if (kind === "project") assert.equal(result.curves[0].kind, "circle");
      else {
        assert.equal(result.results.length, 1);
        assert.ok(Math.abs(result.results[0].volume - 2 * Math.PI) < 1e-8);
      }
    } finally {
      calculator.close();
    }
  });
