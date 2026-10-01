import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { planes } from "../src/sketch/planes.js";
import { continueTags } from "../src/tags/continuation.js";
import { editTags } from "../src/tags/model.js";
import { prism, square } from "./body-edge-fixtures.js";

const check = (reply: { error?: string }) => assert.equal(reply.error, undefined);

test("mixed tags overlap, edit atomically, survive transform/archive, and delete with owner", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const before = owner.view.data;
    const members = [
      { kind: "face" as const, id: body.faces[0].id },
      { kind: "edge" as const, id: body.edges[0].id },
    ];
    for (const name of ["Mount", "Polish"])
      check(
        await owner.call({
          kind: "tagged-group",
          edit: { action: "create", body: body.id, name, members },
        }),
      );
    const tags = owner.view.data.taggedGroups ?? [];
    assert.equal(tags.length, 2);
    assert.notEqual(tags[0].id, tags[1].id);
    const tagged = owner.view.data;
    assert.match(
      (
        await owner.call({
          kind: "tagged-group",
          edit: { action: "update", id: tags[0].id, members: [{ kind: "edge", id: "absent" }] },
        })
      ).error ?? "",
      /current faces or edges/,
    );
    assert.deepEqual(owner.view.data, tagged);
    check(
      await owner.call({
        kind: "transform-bodies",
        transform: {
          ids: [body.id],
          duplicate: false,
          translation: [5, 3, 2],
          pivot: [0, 0, 0],
          axis: [0, 0, 1],
          angle: 0,
        },
      }),
    );
    assert.deepEqual(owner.view.data.taggedGroups, tags);
    const saved = documentArchive(owner.view.data);
    check(await owner.call({ kind: "open", document: readArchive(saved) }));
    assert.deepEqual(owner.view.data.taggedGroups, tags);
    check(await owner.call({ kind: "delete-entities", bodyIds: [body.id], sketchIds: [] }));
    assert.equal(owner.view.data.taggedGroups?.length, 0);
    check(await owner.call({ kind: "undo" }));
    assert.deepEqual(owner.view.data.taggedGroups, tags);
    assert.deepEqual(
      before.bodies?.[0].faces.map((f) => f.id),
      body.faces.map((f) => f.id),
    );
  } finally {
    owner.close();
  }
});

test("split owners create discoverable fresh group IDs and direct agent use resolves current members", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const face = body.faces.find((f) =>
      f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 10) < 1e-7),
    );
    assert.ok(face);
    assert.ok(face);
    check(
      await owner.call({
        kind: "tagged-group",
        edit: {
          action: "create",
          body: body.id,
          name: "Top",
          members: [{ kind: "face", id: face.id }],
        },
      }),
    );
    assert.ok(face);
    const id = (owner.view.data.taggedGroups ?? [])[0].id;
    owner.beginScript("split");
    await owner.scripts.step({
      kind: "splitBody",
      input: { targets: [{ body: body.id }], frame: { ...planes.YZ, origin: [10, 0, 0] } },
    });
    const tags = (await owner.scripts.step({ kind: "taggedGroups", input: {} })) as NonNullable<
      typeof owner.view.data.taggedGroups
    >;
    assert.equal(tags.length, 2);
    assert.ok(
      tags.every(
        (g) =>
          g.id !== id &&
          g.splitFrom === id &&
          g.members.length === 1 &&
          g.problems.includes("split"),
      ),
    );
    await owner.scripts.step({
      kind: "applyTaggedGroup",
      input: { id: tags[0].id, operation: { kind: "offsetFaces", distance: 1 } },
    });
    owner.scripts.finish();
    assert.equal(owner.view.data.bodies?.length, 2);
    assert.ok(
      Math.abs((owner.view.data.bodies ?? []).reduce((v, b) => v + b.volume, 0) - 4200) < 1e-5,
    );
    check(await owner.call({ kind: "undo" }));
    assert.equal(owner.view.data.bodies?.length, 1);
    assert.equal((owner.view.data.taggedGroups ?? [])[0].id, id);
  } finally {
    owner.close();
  }
});

test("imprint splits face membership, cleanup flags expansion, deleted members remain repairable", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const face = body.faces.find((f) =>
      f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 10) < 1e-7),
    );
    assert.ok(face);
    check(
      await owner.call({
        kind: "tagged-group",
        edit: {
          action: "create",
          body: body.id,
          name: "Top",
          members: [{ kind: "face", id: face.id }],
        },
      }),
    );
    owner.beginScript("imprint");
    await owner.scripts.step({
      kind: "imprint",
      input: {
        targets: [{ body: body.id, faces: [face.id] }],
        frame: { ...planes.YZ, origin: [10, 0, 0] },
      },
    });
    owner.scripts.finish();
    const group = (owner.view.data.taggedGroups ?? [])[0];
    assert.equal(group.members.length, 2);
    check(
      await owner.call({
        kind: "tagged-group",
        edit: { action: "update", id: group.id, members: [group.members[0]] },
      }),
    );
    const current = (owner.view.data.bodies ?? [])[0];
    const seam = current.edges.find(
      (e) =>
        current.faces.filter(
          (f) => group.members.some((m) => m.id === f.id) && f.edges.includes(e.id),
        ).length === 2,
    );
    assert.ok(seam);
    check(
      await owner.call({
        kind: "cleanup",
        selection: [{ body: body.id, edges: [seam.id], faces: [], whole: false }],
      }),
    );
    check(await owner.call({ kind: "accept" }));
    assert.ok((owner.view.data.taggedGroups ?? [])[0].problems.includes("expanded"));
    owner.beginScript("remove opening");
    await owner.scripts.step({
      kind: "applyTaggedGroup",
      input: { id: group.id, operation: { kind: "shell", thickness: -1 } },
    });
    owner.scripts.finish();
    const empty = (owner.view.data.taggedGroups ?? [])[0];
    assert.equal(empty.members.length, 0);
    assert.ok(empty.problems.includes("lost"));
    check(
      await owner.call({
        kind: "tagged-group",
        edit: {
          action: "update",
          id: group.id,
          members: [{ kind: "face", id: (owner.view.data.bodies ?? [])[0].faces[0].id }],
        },
      }),
    );
    assert.deepEqual((owner.view.data.taggedGroups ?? [])[0].problems, []);
  } finally {
    owner.close();
  }
});

test("fallback matches are unique, bounded and explicitly inferred", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const document = editTags(owner.view.data, {
      action: "create",
      body: body.id,
      name: "Edge",
      members: [{ kind: "edge", id: body.edges[0].id }],
    });
    const changed = { ...body, edges: body.edges.map((e) => ({ ...e, id: `new-${e.id}` })) };
    const candidate = continueTags(document, { ...document, bodies: [changed] });
    assert.equal((candidate.taggedGroups ?? [])[0].members[0].id, `new-${body.edges[0].id}`);
    assert.deepEqual((candidate.taggedGroups ?? [])[0].problems, ["inferred"]);
    const ambiguous = continueTags(document, {
      ...document,
      bodies: [{ ...changed, edges: [...changed.edges, { ...changed.edges[0], id: "ambiguous" }] }],
    });
    assert.equal((ambiguous.taggedGroups ?? [])[0].members.length, 0);
    assert.ok((ambiguous.taggedGroups ?? [])[0].problems.includes("lost"));
  } finally {
    owner.close();
  }
});

test("copied groups stay independent and unrelated edits never replay old correspondence", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    check(
      await owner.call({
        kind: "tagged-group",
        edit: {
          action: "create",
          body: body.id,
          name: "Rim",
          members: [{ kind: "edge", id: body.edges[0].id }],
        },
      }),
    );
    const transform = {
      ids: [body.id],
      duplicate: true,
      translation: [30, 0, 0] as [number, number, number],
      pivot: [0, 0, 0] as [number, number, number],
      axis: [0, 0, 1] as [number, number, number],
      angle: 0,
    };
    check(await owner.call({ kind: "transform-bodies", transform }));
    const tags = owner.view.data.taggedGroups;
    assert.equal(tags?.length, 2);
    assert.notEqual((tags ?? [])[0].id, (tags ?? [])[1].id);
    const unrelated = await prism(
      owner,
      square.map(([x, y]) => [x, y + 40]),
    );
    assert.deepEqual(owner.view.data.taggedGroups, tags);
    check(
      await owner.call({
        kind: "transform-bodies",
        transform: { ...transform, ids: [unrelated.id], duplicate: false },
      }),
    );
    assert.deepEqual(owner.view.data.taggedGroups, tags);
  } finally {
    owner.close();
  }
});
