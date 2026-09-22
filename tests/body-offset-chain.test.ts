import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { roundedFixture } from "./body-blend-fixtures.js";

for (const type of ["rim", "corner"] as const) {
  test(`normal offset includes the ${type} blend's tangent supports`, async () => {
    const owner = new DocumentOwner();
    try {
      await roundedFixture(owner, type);
      const original = owner.view.data;
      const body = original.bodies?.[0];
      assert.ok(body);
      const seed = body.faces.find((f) => f.blend);
      assert.ok(seed);
      assert.equal(seed.offsetFaces?.length, type === "rim" ? 3 : 7);
      const reply = await owner.call({
        kind: "offset-faces",
        operation: {
          faces: [{ body: body.id, face: seed.id }],
          distance: 0.25,
        },
      });
      assert.equal(reply.error, undefined);
      assert.equal(reply.view.data, original);
      const after = reply.view.candidate?.bodies?.[0];
      assert.ok(after && after.volume > body.volume);
      for (const face of after.faces.filter((f) => f.blend))
        assert.ok(Math.abs((face.blend?.radius ?? 0) - 2.25) < 1e-6);
      const rejected = await owner.call({
        kind: "offset-faces",
        operation: {
          faces: [{ body: body.id, face: seed.id }],
          distance: -3,
        },
      });
      assert.equal(rejected.error, undefined);
      assert.ok((rejected.view.offsetDistance ?? -3) > -2);
      assert.ok((rejected.view.candidate?.bodies?.[0].volume ?? 0) > 0);
      assert.equal(rejected.view.data, original);
    } finally {
      owner.close();
    }
  });
}
