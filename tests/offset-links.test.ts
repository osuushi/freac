import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { bowThrough } from "../src/sketch/arc-geometry.js";
import { emptySketch, newId, type Sketch } from "../src/sketch/document.js";
import { rectangle, segment } from "../src/sketch/geometry.js";
import { coincidentPoints, movePoint } from "../src/sketch/line-edit.js";
import { offsetLinks, offsetResult, prepareOffset } from "../src/sketch/offset-target.js";
import { planes } from "../src/sketch/planes.js";
import { fusePoints } from "../src/sketch/point-links.js";

test("offset copies fused corners across reversed traversal and preserves native Undo", async () => {
  for (const flipped of [false, true]) {
    const source = rectangle(
      emptySketch(planes.XY),
      { x: -10, y: flipped ? 5 : -5 },
      { x: 10, y: flipped ? -5 : 5 },
    ).sketch;
    const target = prepareOffset([
      source.curves[2],
      source.curves[0],
      source.curves[3],
      source.curves[1],
    ]);
    const ids = source.curves.map(() => newId());
    const links = offsetLinks(source, target, ids);
    assert.equal(links.length, 4);
    const owner = new DocumentOwner();
    try {
      assert.equal((await owner.call({ kind: "edit", sketch: source })).error, undefined);
      for (const amount of [-2, 2]) {
        const curves = offsetResult(target, amount, ids);
        const result = {
          ...source,
          curves: [...source.curves, ...curves],
          constraints: [...source.constraints, ...links],
        };
        assert.equal((await owner.call({ kind: "edit", sketch: result })).error, undefined);
        const corner = curves[0];
        assert.ok(corner.kind !== "circle");
        const joined = coincidentPoints(result, { curve: corner.id, end: "b" });
        assert.equal(joined.length, 2);
        assert.ok(joined.every((p) => ids.includes(p.curve)));
        const moved = movePoint(
          result,
          { curve: corner.id, end: "b" },
          { x: corner.b.x + 1, y: corner.b.y + 1 },
        );
        assert.deepEqual(moved.curves.slice(0, 4), source.curves);
        assert.equal((await owner.call({ kind: "edit", sketch: moved })).error, undefined);
        await owner.call({ kind: "undo" });
        assert.deepEqual(owner.view.data.sketches[0], result);
        await owner.call({ kind: "undo" });
      }
    } finally {
      owner.close();
    }
  }
});

test("mixed loop offsets copy transitive endpoint fusion without inventing unlinked joins", () => {
  const line = segment({ x: -4, y: 0 }, { x: 4, y: 0 });
  const arc = bowThrough(segment({ x: 4, y: 0 }, { x: -4, y: 0 }), { x: 0, y: 4 });
  const hub = segment({ x: -4, y: 0 }, { x: -8, y: 0 });
  let source: Sketch = { ...emptySketch(planes.XY), curves: [line, arc, hub] };
  const target = prepareOffset([arc, line]),
    ids = [newId(), newId()];
  assert.deepEqual(offsetLinks(source, target, ids), []);
  source = fusePoints(source, [
    { curve: line.id, end: "a" },
    { curve: hub.id, end: "a" },
    { curve: arc.id, end: "b" },
  ]);
  const links = offsetLinks(source, target, ids);
  assert.equal(links.length, 1);
  const result = {
    ...source,
    curves: [...source.curves, ...offsetResult(target, 1, ids)],
    constraints: [...source.constraints, ...links],
  };
  const link = links[0];
  assert.ok(link.kind === "coincident");
  const a = result.curves.find((c) => c.id === link.a.curve),
    b = result.curves.find((c) => c.id === link.b.curve);
  assert.ok(
    a &&
      b &&
      a.kind !== "circle" &&
      b.kind !== "circle" &&
      link.a.end !== "center" &&
      link.b.end !== "center",
  );
  assert.deepEqual(a[link.a.end], b[link.b.end]);
  assert.equal(offsetLinks(source, prepareOffset([line]), [newId()]).length, 0);
});
