import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { previewSignatures } from "../src/decorators/preview-signatures.js";
import { placedDocument } from "../src/model/body-placement.js";
import { roundBody } from "./decorator-domain-fixtures.js";

test("identical transforms retain group signatures and other bodies stay unchanged", async () => {
  const owner = new DocumentOwner();
  try {
    const bodies = [await roundBody(owner), await roundBody(owner)];
    const faces = bodies.map((body) => ({
      body: body.id,
      face: body.faces.find((face) => face.cylinder)?.id ?? "",
    }));
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "apply", definition: "freac.threads", faces },
        })
      ).error,
      undefined,
    );
    const document = owner.view.data;
    const original = previewSignatures(document, "[]");
    const edit = {
      ids: [bodies[0].id],
      pivot: [0, 0, 0] as [number, number, number],
      axis: [0, 0, 1] as [number, number, number],
      angle: 0,
      translation: [2, 0, 0] as [number, number, number],
      duplicate: false,
    };
    const first = previewSignatures(placedDocument(document, edit), "[]");
    const repeated = previewSignatures(placedDocument(document, edit), "[]");
    const ids = document.decorators?.map((instance) => instance.id) ?? [];
    assert.equal(ids.length, 2);
    assert.notEqual(first.get(ids[0]), original.get(ids[0]));
    assert.equal(first.get(ids[1]), original.get(ids[1]));
    assert.deepEqual(first, repeated);
  } finally {
    owner.close();
  }
});
