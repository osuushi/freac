import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { atHeight, historyChecks, rejectionChecks, shoulder } from "./edge-movement-fixtures.js";

for (const round of [false, true])
  test(`edge reconnection: ${round ? "round" : "rectangular"} shoulder`, async () => {
    const owner = new DocumentOwner();
    try {
      const { body, edges, edit } = await shoulder(owner, round);
      const before = owner.view.data;
      const reply = await owner.call({ kind: "move-edges", operation: edit });
      assert.equal(reply.error, undefined);
      assert.deepEqual(owner.view.data, before);
      const moved = reply.view.candidate?.bodies?.[0];
      assert.ok(moved);
      assert.deepEqual(moved.faces.map((f) => f.id).sort(), body.faces.map((f) => f.id).sort());
      assert.deepEqual(moved.edges.map((e) => e.id).sort(), body.edges.map((e) => e.id).sort());
      assert.deepEqual(
        atHeight(moved, 9)
          .map((e) => e.id)
          .sort(),
        edges.map((e) => e.id).sort(),
      );
      // Ruled spline surfaces have conservative control-pole bounds. Check
      // actual displayed geometry and fixed boundary heights instead.
      for (const face of moved.faces)
        for (let i = 0; i < face.vertices.length; i += 3) {
          const [x, y, z] = face.vertices.slice(i, i + 3);
          assert.ok(z >= -1e-6 && z <= 10 + 1e-6);
          if (round) assert.ok(Math.hypot(x, y) <= 5 + 1e-6);
          else assert.ok(x >= -1e-6 && x <= 20 + 1e-6 && y >= -1e-6 && y <= 20 + 1e-6);
        }
      assert.equal(atHeight(moved, 0).length, round ? 1 : 4);
      assert.equal(atHeight(moved, 10).length, round ? 1 : 4);
      const expected = round
        ? Math.PI * (25 * 9 + (25 + 15 + 9) / 3)
        : 400 * 9 + (400 + 320 + 256) / 3;
      assert.ok(Math.abs(moved.volume - expected) < 1e-6, `${moved.volume} vs ${expected}`);
      await rejectionChecks(owner, edit, round);
      await historyChecks(owner, edit, body.volume);
    } finally {
      owner.close();
    }
  });

for (const round of [false, true])
  test(`edge movement follows rotated ${round ? "round" : "rectangular"} geometry`, async () => {
    const owner = new DocumentOwner();
    try {
      const { body, edit } = await shoulder(owner, round);
      assert.equal(
        (
          await owner.call({
            kind: "transform-bodies",
            transform: {
              ids: [body.id],
              pivot: [0, 0, 0],
              axis: [0, 1, 0],
              angle: 37,
              translation: [17, 9, -3],
              duplicate: false,
            },
          })
        ).error,
        undefined,
      );
      const radians = (37 * Math.PI) / 180;
      const translation: [number, number, number] = [Math.sin(radians), 0, Math.cos(radians)];
      const before = owner.view.data;
      const reply = await owner.call({ kind: "move-edges", operation: { ...edit, translation } });
      assert.equal(reply.error, undefined);
      assert.deepEqual(owner.view.data, before);
      const moved = reply.view.candidate?.bodies?.[0];
      assert.ok(moved);
      const expected = round
        ? Math.PI * (25 * 9 + (25 + 15 + 9) / 3)
        : 400 * 9 + (400 + 320 + 256) / 3;
      assert.ok(Math.abs(moved.volume - expected) < 1e-6);
      const ids = new Set(edit.edges.map((e) => e.edge));
      for (const old of before.bodies?.[0].edges ?? []) {
        const next = moved.edges.find((e) => e.id === old.id);
        assert.ok(next);
        if (old.curve?.kind === "circle" && next.curve?.kind === "circle") {
          assert.ok(Math.abs(old.curve.radius - next.curve.radius) < 1e-7);
          for (let i = 0; i < 3; i++)
            assert.ok(
              Math.abs(
                next.curve.center[i] - old.curve.center[i] - (ids.has(old.id) ? translation[i] : 0),
              ) < 1e-6,
            );
        }
      }
    } finally {
      owner.close();
    }
  });

for (const round of [false, true])
  test(`reconnection lets ${round ? "round" : "rectangular"} shoulders pass the cap height`, async () => {
    const owner = new DocumentOwner();
    try {
      const { body, edit } = await shoulder(owner, round);
      const original = owner.view.data;
      const reply = await owner.call({
        kind: "move-edges",
        operation: { ...edit, translation: [0, 0, 3] },
      });
      assert.equal(reply.error, undefined);
      const moved = reply.view.candidate?.bodies?.[0];
      assert.ok(moved);
      assert.deepEqual(owner.view.data, original);
      assert.deepEqual(
        atHeight(moved, 11)
          .map((e) => e.id)
          .sort(),
        edit.edges.map((e) => e.edge).sort(),
      );
      assert.deepEqual(
        atHeight(moved, 10)
          .map((e) => e.id)
          .sort(),
        atHeight(body, 10)
          .map((e) => e.id)
          .sort(),
      );
      const expected = round
        ? Math.PI * (25 * 11 - (25 + 15 + 9) / 3)
        : 400 * 11 - (400 + 320 + 256) / 3;
      assert.ok(Math.abs(moved.volume - expected) < expected * 1e-8);
    } finally {
      owner.close();
    }
  });
