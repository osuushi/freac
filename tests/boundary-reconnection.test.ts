import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body, Edge, EdgeMovement, FaceMovement } from "../src/model/body.js";
import type { Vector } from "../src/sketch/planes.js";
import { atHeight, shoulder } from "./edge-movement-fixtures.js";

for (const round of [true, false])
  for (const target of ["lower", "upper", "face", "single"] as const) {
    if (round && target === "single") continue;
    test(`reconnect ${round ? "round" : "rectangular"} ${target}: axial and lateral, reopen and re-edit`, async () => {
      const owner = new DocumentOwner();
      try {
        const { body } = await shoulder(owner, round);
        const before = owner.view.data;
        const edges = atHeight(body, target === "lower" || target === "single" ? 8 : 10);
        const ids = (target === "single" ? edges.slice(0, 1) : edges).map((e) => ({
          body: body.id,
          edge: e.id,
        }));
        const top = body.faces.find((f) =>
          f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 10) < 1e-6),
        );
        assert.ok(top);
        for (const translation of [
          [0, 0, 1],
          [1, 0, 0],
        ] as Vector[]) {
          const baseline = owner.view.data;
          const common = { translation };
          const request =
            target === "face"
              ? {
                  kind: "move-faces" as const,
                  operation: {
                    ...common,
                    faces: [{ body: body.id, face: top.id }],
                    pivot: [0, 0, 0],
                    axis: [0, 0, 1],
                    angle: 0,
                  } as FaceMovement,
                }
              : {
                  kind: "move-edges" as const,
                  operation: { ...common, edges: ids } as EdgeMovement,
                };
          const reply = await owner.call(request);
          assert.equal(reply.error, undefined, `${translation}: ${reply.error}`);
          const next = reply.view.candidate?.bodies?.[0];
          assert.ok(next);
          assert.deepEqual(owner.view.data, baseline);
          assert.deepEqual(next.faces.map((f) => f.id).sort(), body.faces.map((f) => f.id).sort());
          assert.deepEqual(next.edges.map((e) => e.id).sort(), body.edges.map((e) => e.id).sort());
          checkTranslatedEdges(next, target === "single" ? edges.slice(0, 1) : edges, translation);
          if (target === "single" && translation[2])
            assert.ok(
              next.faces.filter((f) => !f.plane).length >= 2,
              "Neighboring chamfer faces actually warp",
            );
          assert.equal((await owner.call({ kind: "accept" })).error, undefined);
          const accepted = owner.view.data;
          await owner.call({ kind: "undo" });
          assert.deepEqual(owner.view.data, baseline);
          await owner.call({ kind: "redo" });
          assert.deepEqual(owner.view.data, accepted);
          assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
          const again = await owner.call(request);
          assert.equal(again.error, undefined, `Re-edit: ${again.error}`);
          assert.ok(again.view.candidate);
          await owner.call({ kind: "cancel-preview" });
          assert.equal((await owner.call({ kind: "open", document: before })).error, undefined);
        }
      } finally {
        owner.close();
      }
    });
  }

function checkTranslatedEdges(next: Body, edges: readonly Edge[], translation: Vector) {
  for (const selected of edges) {
    const moved: Edge | undefined = next.edges.find((e) => e.id === selected.id);
    assert.ok(moved);
    if (selected.curve?.kind === "circle" && moved.curve?.kind === "circle") {
      assert.ok(Math.abs(moved.curve.radius - selected.curve.radius) < 1e-7);
      for (let i = 0; i < 3; i++)
        assert.ok(
          Math.abs(moved.curve.center[i] - selected.curve.center[i] - translation[i]) < 1e-6,
        );
    } else {
      assert.equal(moved.curve?.kind, "line");
    }
  }
}
