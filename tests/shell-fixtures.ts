import assert from "node:assert/strict";
import type { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";

export function cap(body: Body, z: number): string {
  const face = body.faces.find(
    (f) => f.plane && f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - z) < 1e-6),
  );
  assert.ok(face);
  return face.id;
}
export async function shell(
  owner: DocumentOwner,
  body: Body,
  thickness: number,
  faces: string[] = [],
) {
  const reply = await owner.call({
    kind: "shell",
    operation: { thickness, selection: [{ body: body.id, faces }] },
  });
  assert.equal(
    reply.error,
    undefined,
    `thickness=${thickness}, openings=${faces.length}: ${reply.error}`,
  );
  const result = reply.view.candidate?.bodies?.find((b) => b.id === body.id);
  assert.ok(result);
  return result;
}
