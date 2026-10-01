import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { prism, square } from "./body-edge-fixtures.js";

test("Boolean split continues tagged edges on both results; union preserves distinct same-name groups", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const edge = body.edges.find(
      (e) =>
        e.curve?.kind === "line" &&
        e.points.every((v, i) => i % 3 === 0 || Math.abs(v - (i % 3 === 1 ? 0 : 10)) < 1e-7),
    );
    assert.ok(edge);
    assert.equal(
      (
        await owner.call({
          kind: "tagged-group",
          edit: {
            action: "create",
            body: body.id,
            name: "Rim",
            members: [{ kind: "edge", id: edge.id }],
          },
        })
      ).error,
      undefined,
    );
    const old = (owner.view.data.taggedGroups ?? [])[0];
    const cutter = await prism(owner, [
      [8, -1],
      [12, -1],
      [12, 21],
      [8, 21],
    ]);
    owner.beginScript("cut");
    await owner.scripts.step({
      kind: "booleanBodies",
      input: { ids: [body.id, cutter.id], mode: "subtract", keepOriginals: false },
    });
    owner.scripts.finish();
    const split = owner.view.data.taggedGroups ?? [];
    assert.equal(split.length, 2);
    assert.equal(new Set(split.map((g) => g.id)).size, 2);
    assert.ok(
      split.every(
        (g) => g.splitFrom === old.id && g.members.length === 1 && g.members[0].kind === "edge",
      ),
    );
    const bridge = await prism(owner, [
      [7, 0],
      [13, 0],
      [13, 20],
      [7, 20],
    ]);
    owner.beginScript("join");
    await owner.scripts.step({
      kind: "booleanBodies",
      input: {
        ids: [...new Set(split.map((g) => g.body)), bridge.id],
        mode: "union",
        keepOriginals: false,
      },
    });
    owner.scripts.finish();
    const groups = owner.view.data.taggedGroups ?? [];
    assert.equal(groups.length, 2);
    assert.deepEqual(
      groups.map((g) => g.id),
      split.map((g) => g.id),
    );
    assert.equal(groups[0].body, groups[1].body);
    assert.ok(groups.every((g) => g.name === "Rim"));
    assert.equal(owner.view.data.bodies?.length, 1);
  } finally {
    owner.close();
  }
});

test("cross-owner membership rejects atomically; incompatible group operations roll back script", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const other = await prism(
      owner,
      square.map(([x, y]) => [x + 30, y]),
    );
    const before = owner.view.data;
    const bad = await owner.call({
      kind: "tagged-group",
      edit: {
        action: "create",
        body: body.id,
        name: "Invalid",
        members: [
          { kind: "face", id: body.faces[0].id },
          { kind: "edge", id: other.edges[0].id },
        ],
      },
    });
    assert.match(bad.error ?? "", /one body/);
    assert.equal(owner.view.data, before);
    owner.beginScript("invalid group operation");
    const groups = (await owner.scripts.step({
      kind: "editTaggedGroup",
      input: {
        action: "create",
        body: body.id,
        name: "Mixed",
        members: [
          { kind: "face", id: body.faces[0].id },
          { kind: "edge", id: body.edges[0].id },
        ],
      },
    })) as { id: string }[];
    await assert.rejects(
      owner.scripts.step({
        kind: "applyTaggedGroup",
        input: { id: groups[0].id, operation: { kind: "finishEdges", mode: "fillet", size: 1 } },
      }),
      /incompatible/,
    );
    await owner.scripts.cancel("incompatible");
    assert.equal(owner.view.data, before);
  } finally {
    owner.close();
  }
});
