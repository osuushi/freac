import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { cylinderCoordinates, cylinderFrame } from "../src/decorators/cylinder.js";
import { threadTolerance } from "../src/decorators/precision.js";
import { threadMeshes, threadRadius } from "../src/decorators/thread-mesh.js";
import { threadDefaults } from "../src/decorators/thread-settings.js";
import { validateMesh } from "../src/model/export-mesh.js";
import type { Vector } from "../src/sketch/planes.js";
import { roundBody } from "./decorator-domain-fixtures.js";

test("straight thread profiles retain their accuracy budget across pitches, hands and reference modes", async () => {
  const owner = new DocumentOwner();
  try {
    for (const [radius, pitch, length, preset] of [
      [0.5, 0.25, 3, "metric"],
      [5, 1.5, 10, "metric"],
      [20, 4, 20, "metric"],
      [5, 7, 10, "metric"],
      [5, 1, 10, "fdm-fine"],
      [5, 1.5, 10, "fdm-coarse"],
    ] as const) {
      const body = await roundBody(owner, [radius], length);
      const face = body.faces.find((f) => f.cylinder);
      assert.ok(face?.cylinder);
      const frame = cylinderFrame(face.cylinder);
      for (const hand of ["right", "left"] as const)
        for (const cut of ["rod", "hole"] as const) {
          const settings = {
            ...threadDefaults(2 * radius, preset),
            pitch,
            hand,
            cut,
            start: 0.2,
            end: 0.3,
          };
          const geometry = threadMeshes(frame, [face], settings);
          assert.ok(geometry);
          const mesh = geometry.fill;
          validateMesh(mesh);
          const half = mesh.vertices.length / 2;
          let deviation = 0;
          for (const triangle of mesh.triangles) {
            if (triangle.some((i) => i < half)) continue;
            const points = triangle.map((i) => mesh.vertices[i]);
            for (const weights of [
              [1 / 3, 1 / 3, 1 / 3],
              [0.5, 0.5, 0],
              [0, 0.5, 0.5],
              [0.5, 0, 0.5],
            ]) {
              const p = [0, 1, 2].map((axis) =>
                points.reduce((sum, point, i) => sum + point[axis] * weights[i], 0),
              ) as Vector;
              const { angle, z } = cylinderCoordinates(frame, p);
              const expected = threadRadius(radius, angle, z, settings, 1, [0.2, length - 0.3]);
              deviation = Math.max(deviation, Math.abs(Math.hypot(p[0], p[1]) - expected));
            }
          }
          assert.ok(
            deviation <= 2 * threadTolerance(settings),
            `Ø${2 * radius} pitch ${pitch} ${hand}/${cut}: ${deviation} mm deviation`,
          );
        }
    }
  } finally {
    owner.close();
  }
});
