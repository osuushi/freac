import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { exportMesh } from "../src/model/export-mesh.js";
import { stepItems, validateStepItems } from "../src/model/step-export.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { lift, prism, square } from "./body-edge-fixtures.js";

test("STEP exports exact curved and separate solids without changing accepted state or history", async () => {
  const owner = new DocumentOwner();
  try {
    await prism(owner, square);
    await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [
        { id: "circle", kind: "circle", center: { x: 40, y: -10 }, radius: 5, construction: false },
      ],
    });
    const before = structuredClone(owner.view);
    const history = (await owner.call({ kind: "read-history" })).history;
    const items = stepItems(owner.view.data.bodies ?? []);
    const reply = await owner.call({ kind: "export-step", items });
    assert.equal(reply.error, undefined);
    assert.ok(reply.step);
    assert.match(reply.step, /^ISO-10303-21;/);
    assert.match(reply.step, /AP242/);
    assert.match(reply.step, /SI_UNIT\(\.MILLI\.,\.METRE\.\)/);
    assert.equal((reply.step.match(/= MANIFOLD_SOLID_BREP\(/g) ?? []).length, 2);
    assert.match(reply.step, /CYLINDRICAL_SURFACE/);
    assert.doesNotMatch(reply.step, /TRIANGULATED_FACE|TESSELLATED_SOLID/);
    assert.deepEqual(owner.view, before);
    assert.deepEqual((await owner.call({ kind: "read-history" })).history, history);
  } finally {
    owner.close();
  }
});

test("STEP mixes an exact solid with a native AP242 mesh and uses a captured snapshot", async () => {
  const owner = new DocumentOwner();
  try {
    const first = await prism(owner, square);
    const second = await prism(
      owner,
      square.map(([x, y]) => [x + 30, y - 10]),
    );
    const snapshot = stepItems([first, second], [undefined, exportMesh(second)]);
    assert.equal((await owner.call({ kind: "new" })).error, undefined);
    const before = structuredClone(owner.view);
    const reply = await owner.call({ kind: "export-step", items: snapshot });
    assert.equal(reply.error, undefined);
    assert.ok(reply.step);
    assert.equal((reply.step.match(/= MANIFOLD_SOLID_BREP\(/g) ?? []).length, 1);
    assert.equal((reply.step.match(/= TESSELLATED_SOLID\(/g) ?? []).length, 1);
    assert.match(reply.step, /TRIANGULATED_FACE/);
    assert.deepEqual(owner.view, before);
  } finally {
    owner.close();
  }
});

test("STEP rejects empty, corrupt exact and open or invalid meshes without changing history", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const mesh = exportMesh(body);
    const before = structuredClone(owner.view);
    assert.throws(() => validateStepItems([]), /Create or show/);
    assert.throws(() => validateStepItems([{ brep: "not a shape" }]), /encoding/);
    assert.throws(
      () => validateStepItems([{ mesh: { ...mesh, triangles: mesh.triangles.slice(1) } }]),
      /not closed/,
    );
    assert.throws(
      () => validateStepItems([{ mesh: { ...mesh, triangles: [[-1, 0, 2]] } }]),
      /triangle/,
    );
    assert.throws(
      () => validateStepItems([{ mesh: { ...mesh, vertices: [[NaN, 0, 0]] } }]),
      /coordinates/,
    );
    assert.throws(() => stepItems([body], []), /body count/);
    assert.ok((await owner.call({ kind: "export-step", items: [{ brep: "00" }] })).error);
    assert.equal((await owner.call({ kind: "cancel-step-export" })).error, undefined);
    assert.deepEqual(owner.view, before);
  } finally {
    owner.close();
  }
});

test("STEP cancellation stops its native child and a subsequent export works", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const before = structuredClone(owner.view);
    const items = stepItems([body]);
    const pending = owner.call({ kind: "export-step", items });
    assert.equal((await owner.call({ kind: "cancel-step-export" })).error, undefined);
    assert.match((await pending).error ?? "", /cancelled/);
    const recovered = await owner.call({ kind: "export-step", items });
    assert.equal(recovered.error, undefined);
    assert.match(recovered.step ?? "", /^ISO-10303-21;/);
    assert.deepEqual(owner.view, before);
  } finally {
    owner.close();
  }
});
