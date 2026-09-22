import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { prism, square } from "./body-edge-fixtures.js";
import { feature, operation } from "./face-movement-fixtures.js";

for (const kind of ["hole", "pocket", "boss"] as const)
  test(`shared reconnection moves ${kind} without warping the stock`, async () => {
    const owner = new DocumentOwner();
    try {
      await prism(owner, square);
      const body = await feature(owner, kind);
      const request = {
        kind: "move-faces" as const,
        operation: { ...operation(body, kind, 3) },
      };
      const result = await owner.call(request);
      assert.equal(result.error, undefined);
      const moved = result.view.candidate?.bodies?.[0];
      assert.ok(moved);
      assert.ok(Math.abs(moved.volume - body.volume) < 1e-6);
      assert.deepEqual(moved.faces.map((f) => f.id).sort(), body.faces.map((f) => f.id).sort());
      const selected = new Set(request.operation.faces.map((t) => t.face));
      for (const face of body.faces) {
        const next = moved.faces.find((f) => f.id === face.id);
        assert.ok(next);
        if (face.plane) {
          assert.ok(next.plane, "Planar walls and attachments stay planar");
          const { u, v } = face.plane;
          const axis = [
            u[1] * v[2] - u[2] * v[1],
            u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0],
          ];
          if (!selected.has(face.id)) {
            const old = face.vertices;
            for (let i = 0; i < next.vertices.length; i += 3) {
              const delta = next.vertices.slice(i, i + 3).map((v, j) => v - old[j]);
              assert.ok(Math.abs(delta.reduce((sum, v, j) => sum + v * axis[j], 0)) < 1e-6);
            }
          }
        }
        if (face.cylinder && next.cylinder) {
          assert.ok(Math.abs(next.cylinder.radius - face.cylinder.radius) < 1e-7);
          assert.ok(Math.abs(next.cylinder.origin[0] - face.cylinder.origin[0] - 3) < 1e-6);
        }
      }
      for (const edge of body.edges) {
        const outer = [0, 1].some((axis) =>
          [0, 20].some((bound) =>
            edge.points.every((v, i) => i % 3 !== axis || Math.abs(v - bound) < 1e-7),
          ),
        );
        if (!outer) continue;
        const next = moved.edges.find((e) => e.id === edge.id);
        assert.ok(next);
        for (let i = 2; i < edge.signature.length; i++)
          assert.ok(
            Math.abs(next.signature[i] - edge.signature[i]) < 1e-6,
            "Outer stock boundary stays fixed",
          );
      }
      await owner.call({ kind: "accept" });
      const accepted = owner.view.data;
      assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
      const reverse = await owner.call({
        ...request,
        operation: { ...request.operation, translation: [-3, 0, 0] },
      });
      assert.equal(reverse.error, undefined);
      assert.ok(Math.abs((reverse.view.candidate?.bodies?.[0].volume ?? 0) - body.volume) < 1e-6);
      const rejected = await owner.call({
        ...request,
        operation: { ...request.operation, translation: [20, 0, 0] },
      });
      assert.ok(rejected.error, "Disconnected/out-of-stock feature must reject");
      assert.equal(rejected.view.candidate, null);
    } finally {
      owner.close();
    }
  });
