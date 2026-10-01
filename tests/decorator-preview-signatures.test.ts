import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { PreviewSignatureCache, previewSignatures } from "../src/decorators/preview-signatures.js";
import { placedDocument } from "../src/model/body-placement.js";
import type { SketchDocument } from "../src/sketch/document.js";
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

test("shared supports serialize once and cached signatures preserve the existing bytes", async (context) => {
  const owner = new DocumentOwner();
  try {
    const body = await roundBody(owner, [10, 6]);
    const applied = await owner.call({
      kind: "decorator",
      edit: {
        action: "apply",
        definition: "freac.threads",
        faces: body.faces
          .filter((face) => face.cylinder)
          .map((face) => ({ body: body.id, face: face.id })),
      },
    });
    assert.equal(applied.error, undefined);
    const document = owner.view.data;
    assert.equal(document.decorators?.length, 2);
    const expected = new Map(
      document.decorators.map((instance) => [
        instance.id,
        JSON.stringify([
          instance.definition,
          instance.version,
          instance.faces,
          instance.settings,
          instance.frame,
          instance.axialReference,
          [{ center: body.center, faces: body.faces }],
        ]),
      ]),
    );
    const stringify = JSON.stringify;
    let supportSerializations = 0;
    context.mock.method(JSON, "stringify", (value: unknown) => {
      if (value && typeof value === "object" && "faces" in value && value.faces === body.faces)
        supportSerializations++;
      return stringify(value);
    });
    const cache = new PreviewSignatureCache();
    assert.deepEqual(previewSignatures(document, "[]", cache), expected);
    assert.equal(supportSerializations, 1, "two groups share one support serialization");
    for (let frame = 0; frame < 20; frame++)
      assert.deepEqual(previewSignatures(document, "[]", cache), expected);
    assert.equal(supportSerializations, 1, "unchanged input does not serialize its support again");
    assert.deepEqual(
      previewSignatures(document, "different enabled sources", cache),
      expected,
      "built-in dependencies stay scoped to their supports",
    );
    const modified: SketchDocument = {
      ...document,
      bodies: document.bodies?.map((body) => ({ ...body, center: [1, 0, 5] })),
    };
    const changed = previewSignatures(modified, "[]", cache);
    assert.ok([...changed].every(([id, key]) => key !== expected.get(id)));
    assert.equal(supportSerializations, 2, "changed immutable support is serialized once");
  } finally {
    context.mock.restoreAll();
    owner.close();
  }
});

test("custom signatures cache serialization while retaining every document and source dependency", async (context) => {
  const owner = new DocumentOwner();
  try {
    const body = await roundBody(owner);
    await owner.call({
      kind: "decorator",
      edit: {
        action: "apply",
        definition: "freac.threads",
        faces: body.faces
          .filter((face) => face.cylinder)
          .map((face) => ({ body: body.id, face: face.id })),
      },
    });
    const instance = owner.view.data.decorators?.[0];
    assert.ok(instance);
    const document: SketchDocument = {
      ...owner.view.data,
      decorators: ["a", "b"].map((id) => ({ ...instance, id, definition: "example.preview" })),
    };
    const sources = '["quoted\\" source", "line\\nend"]';
    const expected = JSON.stringify([document, sources]),
      stringify = JSON.stringify;
    let documentSerializations = 0;
    context.mock.method(JSON, "stringify", (value: unknown) => {
      if (value === document) documentSerializations++;
      return stringify(value);
    });
    const cache = new PreviewSignatureCache();
    for (let frame = 0; frame < 20; frame++)
      assert.deepEqual(
        [...previewSignatures(document, sources, cache).values()],
        [expected, expected],
      );
    assert.equal(documentSerializations, 1);
    assert.ok(
      [...previewSignatures(document, `${sources} changed`, cache).values()].every(
        (key) => key !== expected,
      ),
    );
    const unrelated: SketchDocument = {
      ...document,
      entityPresentation: [{ id: body.id, name: "renamed unrelated entity" }],
    };
    assert.ok(
      [...previewSignatures(unrelated, sources, cache).values()].every((key) => key !== expected),
      "custom hooks retain full-document context",
    );
    assert.equal(
      documentSerializations,
      1,
      "enabled source changes reuse only the immutable document serialization",
    );
  } finally {
    context.mock.restoreAll();
    owner.close();
  }
});
