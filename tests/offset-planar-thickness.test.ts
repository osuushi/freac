import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { sharedThickness } from "../src/model/face-offset-targets.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture: { document: SketchDocument } = JSON.parse(
  readFileSync("tests/fixtures/offset-planar-thickness.json", "utf8"),
);
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("captured planar faces use the nearest wall, including the small recessed patch", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    for (const body of before.bodies ?? []) {
      const caps = body.faces.filter(
        (f) => f.plane && f.signature[2] > 100 && Math.abs(f.plane.v[2]) > 0.99,
      );
      assert.equal(caps.length, 2);
      for (const cap of caps) {
        const recessedReference = cap.id === "0b6195ce-e316-4ccd-bc2c-c196d103e17b";
        const initial = recessedReference ? 2 : 4;
        near(cap.thickness?.distance ?? NaN, initial);
        const reference = body.faces.find((f) => f.id === cap.thickness?.face);
        assert.ok(reference);
        assert.equal(
          reference.id,
          recessedReference
            ? "b985780b-c17d-48f7-95f5-faebab5d15ac"
            : caps.find((f) => f.id !== cap.id)?.id,
        );
        assert.equal(cap.thickness?.slope, 1);
        assert.ok(sharedThickness([cap], [{ body: body.id, face: cap.id }]));
        for (const distance of [1, -1]) {
          const reply = await owner.call({
            kind: "offset-faces",
            operation: { faces: [{ body: body.id, face: cap.id }], distance },
          });
          assert.equal(reply.error, undefined);
          near(reply.view.offsetDistance ?? NaN, distance);
          const result = reply.view.candidate?.bodies?.find((b) => b.id === body.id);
          assert.ok(result);
          near(
            result.faces.find((f) => f.id === cap.id)?.thickness?.distance ?? NaN,
            initial + distance,
          );
          near(result.volume, body.volume + cap.signature[2] * distance);
          assert.deepEqual(
            result.faces.find((f) => f.id === reference?.id)?.plane,
            reference?.plane,
          );
          assert.deepEqual(owner.view.data, before);
          await owner.call({ kind: "discard" });
        }
      }
    }
  } finally {
    owner.close();
  }
});
