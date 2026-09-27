import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import type { Body, Face } from "../src/model/body.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import type { ModelRequest } from "../src/sketch/model-api.js";
import { roundBody } from "./decorator-domain-fixtures.js";

async function run(owner: DocumentOwner, request: ModelRequest) {
  const reply = await owner.call(request);
  assert.equal(reply.error, undefined);
  return reply;
}

async function ribbedCylinder(owner: DocumentOwner): Promise<Body> {
  let body = await roundBody(owner);
  for (let z = 10; z <= 20; z += 10) {
    const top = body.faces.find((face) => face.plane && Math.abs(face.plane.origin[2] - z) < 1e-7);
    assert.ok(top);
    await run(owner, {
      kind: "extrude",
      extrusion: { sources: [{ face: top.id }], distance: 10, mode: "new" },
    });
    await run(owner, { kind: "accept" });
    body = owner.view.data.bodies?.at(-1) as Body;
  }
  await run(owner, {
    kind: "boolean-bodies",
    operation: {
      ids: owner.view.data.bodies?.map((candidate) => candidate.id) ?? [],
      mode: "union",
      keepOriginals: false,
    },
  });
  await run(owner, { kind: "accept" });
  return owner.view.data.bodies?.[0] as Body;
}

function sides(body: Body): Face[] {
  const cylindrical = body.faces.filter((face) => face.cylinder);
  cylindrical.sort((a, b) => a.signature[5] - b.signature[5]);
  assert.equal(cylindrical.length, 3);
  return cylindrical;
}

async function decorate(owner: DocumentOwner, body: Body, faces: Face[]) {
  await run(owner, {
    kind: "decorator",
    edit: {
      action: "apply",
      definition: threadDefinition,
      faces: faces.map((face) => ({ body: body.id, face: face.id })),
    },
  });
}

const whole = (body: Body) => ({ body: body.id, whole: true, faces: [], edges: [] });

test("cleanup preserves a decorated boundary while merging undecorated neighbors", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await ribbedCylinder(owner);
    await decorate(owner, body, [sides(body)[0]]);
    const before = owner.view.data;
    await run(owner, { kind: "cleanup", selection: [whole(body)] });
    const candidate = owner.view.candidate;
    assert.equal(candidate?.bodies?.[0].faces.filter((face) => face.cylinder).length, 2);
    assert.equal(candidate?.decorators?.[0].faces.length, 1);
    assert.equal(candidate?.decorators?.[0].problem, undefined);
    await run(owner, { kind: "accept" });
    await run(owner, { kind: "undo" });
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});

test("cleanup merges adjacent faces of one decoration group and keeps its boundary", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await ribbedCylinder(owner);
    await decorate(owner, body, sides(body).slice(0, 2));
    await run(owner, { kind: "cleanup", selection: [whole(body)] });
    const candidate = owner.view.candidate;
    assert.equal(candidate?.bodies?.[0].faces.filter((face) => face.cylinder).length, 2);
    assert.equal(candidate?.decorators?.[0].faces.length, 1);
    assert.equal(candidate?.decorators?.[0].problem, undefined);
    await run(owner, { kind: "accept" });
    const instance = owner.view.data.decorators?.[0];
    assert.ok(instance);
    await run(owner, {
      kind: "decorator",
      edit: { action: "settings", ids: [instance.id], patch: { hand: "left" } },
    });
    const saved = documentArchive(owner.view.data);
    await run(owner, { kind: "open", document: readArchive(saved) });
    assert.equal(owner.view.data.decorators?.[0].settings.hand, "left");
    assert.equal(owner.view.data.decorators?.[0].faces.length, 1);
  } finally {
    owner.close();
  }
});

test("selected seam and whole cleanup cannot merge two distinct decoration groups", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await ribbedCylinder(owner);
    const [first, second] = sides(body);
    await decorate(owner, body, [first]);
    await decorate(owner, body, [second]);
    const before = owner.view.data;
    const seam = body.edges.find((edge) =>
      edge.points.every((value, index) => index % 3 !== 2 || Math.abs(value - 10) < 1e-7),
    );
    assert.ok(seam);
    await run(owner, {
      kind: "cleanup",
      selection: [{ ...whole(body), whole: false, edges: [seam.id] }],
    });
    assert.equal(owner.view.candidate, before);
    await run(owner, { kind: "discard" });
    await run(owner, { kind: "cleanup", selection: [whole(body)] });
    assert.equal(owner.view.candidate, before);
    assert.equal(owner.view.candidate?.decorators?.length, 2);
  } finally {
    owner.close();
  }
});

test("modal cleanup check and acceptance keep the boundary of a threaded face", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await ribbedCylinder(owner);
    await decorate(owner, body, [sides(body)[2]]);
    const before = owner.view.data;
    const top = body.faces.find((face) => face.plane && Math.abs(face.plane.origin[2] - 30) < 1e-7);
    assert.ok(top);
    await run(owner, {
      kind: "extrude",
      extrusion: { sources: [{ face: top.id }], distance: 10, mode: "union" },
    });
    await run(owner, { kind: "check-cleanup" });
    assert.equal(owner.view.cleanupAvailable, false);
    await run(owner, { kind: "accept", cleanup: true });
    assert.equal(owner.view.data.bodies?.[0].faces.filter((face) => face.cylinder).length, 4);
    assert.equal(owner.view.data.decorators?.[0].faces.length, 1);
    assert.equal(owner.view.data.decorators?.[0].problem, undefined);
    await run(owner, { kind: "undo" });
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});
