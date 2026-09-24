import assert from "node:assert/strict";
import test from "node:test";
import { threadRadius } from "../src/decorators/thread-mesh.js";
import {
  coarseMetric,
  patchThreadSettings,
  threadDefaults,
  threadSettings,
} from "../src/decorators/thread-settings.js";

test("printing inputs resolve complementary profiles independent of material side", () => {
  for (const preset of ["print-upright", "print-sideways"] as const) {
    const settings = patchThreadSettings(10.3, threadDefaults(10.3), {
      preset,
      layerHeight: 0.3,
      nozzleDiameter: 0.6,
    });
    assert.equal(settings.profile, "rounded");
    assert.equal(settings.clearance, 0.3);
    assert.ok(Math.abs(settings.pitch - (preset === "print-upright" ? 1.8 : 3)) < 1e-12);
    for (const cut of ["rod", "hole"] as const)
      for (const angle of [0, 0.9, 2.1])
        for (const z of [1, 2.7, 5]) {
          const s = { ...settings, cut };
          assert.ok(
            Math.abs(
              threadRadius(5.15, angle, z, s, -1, [0, 10]) -
                threadRadius(5.15, angle, z, s, 1, [0, 10]) -
                s.clearance,
            ) < 1e-12,
          );
        }
    const edited = patchThreadSettings(10.3, settings, { nozzleDiameter: 0.8 });
    assert.equal(edited.clearance, 0.4);
    assert.ok(edited.pitch > settings.pitch);
    assert.deepEqual(patchThreadSettings(20, edited, { hand: "left" }), {
      ...edited,
      hand: "left",
    });
    assert.equal(patchThreadSettings(10.3, edited, { preset, pitch: 4 }).pitch, 4);
  }
});

test("legacy settings normalize printing defaults and reject invalid printer edits", () => {
  const legacy = { ...threadDefaults(10) };
  delete (legacy as Partial<typeof legacy>).layerHeight;
  delete (legacy as Partial<typeof legacy>).nozzleDiameter;
  assert.equal(threadSettings(legacy).layerHeight, 0.2);
  assert.equal(threadSettings(legacy).nozzleDiameter, 0.4);
  assert.throws(() => patchThreadSettings(10, legacy, { nozzleDiameter: NaN }), /nozzle/);
  assert.throws(() => patchThreadSettings(10, legacy, { layerHeight: 0 }), /layer/);
  assert.deepEqual(coarseMetric(11), { diameter: 10, pitch: 1.5, listed: false });
});
