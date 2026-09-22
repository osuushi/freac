import assert from "node:assert/strict";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { documentArchive } from "../src/model/document-archive.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { insideBoundary, profilesFor } from "../src/sketch/profiles.js";

export async function cylindricalAxisFixture(partial: boolean): Promise<string> {
  const owner = new DocumentOwner();
  try {
    const cylinder: Sketch = {
      ...emptySketch(planes.XY),
      curves: [
        { id: "circle", kind: "circle", center: { x: 12, y: 0 }, radius: 4, construction: false },
        ...(partial
          ? [
              {
                id: "diameter",
                kind: "segment" as const,
                a: { x: 12, y: -4 },
                b: { x: 12, y: 4 },
                construction: false,
              },
            ]
          : []),
      ],
    };
    assert.equal((await owner.call({ kind: "edit", sketch: cylinder })).error, undefined);
    const profile = profilesFor(cylinder).find((p) => insideBoundary(p.outer, { x: 14, y: 0 }));
    assert.ok(profile);
    assert.equal(
      (
        await owner.call({
          kind: "extrude",
          extrusion: {
            sources: [{ sketch: cylinder.id, profile: profile.key }],
            distance: 12,
            mode: "new",
          },
        })
      ).error,
      undefined,
    );
    await owner.call({ kind: "accept" });
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    assert.ok(Math.abs(body.volume - (partial ? 96 : 192) * Math.PI) < 1e-6);
    const wall = body.faces.find((f) => f.cylinder)?.cylinder;
    assert.ok(wall);
    assert.ok(
      Math.abs(wall.axis[0]) < 1e-8 &&
        Math.abs(wall.axis[1]) < 1e-8 &&
        Math.abs(Math.abs(wall.axis[2]) - 1) < 1e-8,
    );
    assert.equal(wall.origin[0], 12);
    const section = rectangle(emptySketch(planes.XZ), { x: 18, y: 2 }, { x: 20, y: 4 }).sketch;
    assert.equal((await owner.call({ kind: "edit", sketch: section })).error, undefined);
    const invalid = rectangle(
      emptySketch({ ...planes.XY, origin: [0, 0, 20] }),
      { x: 18, y: 2 },
      { x: 20, y: 4 },
    ).sketch;
    assert.equal((await owner.call({ kind: "edit", sketch: invalid })).error, undefined);
    return documentArchive(owner.view.data);
  } finally {
    owner.close();
  }
}
