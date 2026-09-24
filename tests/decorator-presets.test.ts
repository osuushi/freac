import assert from "node:assert/strict";
import test from "node:test";
import { threadRadius } from "../src/decorators/thread-mesh.js";
import {
  coarseMetric,
  patchThreadSettings,
  threadDefaults,
  threadDepth,
  threadSettings,
} from "../src/decorators/thread-settings.js";

test("FDM presets resolve the captured 1 mm triangular ridge and one hole-side tolerance", () => {
  for (const [preset, pitch] of [
    ["fdm-fine", 0.5],
    ["fdm-coarse", 1],
  ] as const) {
    const settings = threadDefaults(10.3, preset);
    assert.equal(settings.pitch, pitch);
    assert.equal(settings.profile, "triangle");
    assert.equal(threadDepth(settings), 1);
    assert.equal(settings.clearance, 0.05);
    assert.equal(threadRadius(5.15, 0, 0, settings, 1, [0, 10]), 5.15);
    assert.equal(threadRadius(5.15, 0, pitch / 2, settings, 1, [0, 10]), 4.15);
    assert.equal(threadRadius(5.15, 0, pitch, settings, 1, [0, 10]), 5.15);
    assert.equal(threadRadius(5.15, 0, pitch / 2, settings, -1, [0, 10]), 4.2);
    assert.equal(
      threadRadius(5.15, 0, pitch / 2, { ...settings, clearance: 0 }, -1, [0, 10]),
      4.15,
    );
    assert.deepEqual(patchThreadSettings(20, settings, { hand: "left" }), {
      ...settings,
      hand: "left",
    });
  }
  assert.equal(threadDefaults(10.3).preset, "fdm-fine");
  const coarse = patchThreadSettings(10.3, threadDefaults(10.3), { preset: "fdm-coarse" });
  assert.equal(coarse.pitch, 1);
  assert.equal(patchThreadSettings(10.3, coarse, { preset: "fdm-fine" }).pitch, 0.5);
  assert.equal(patchThreadSettings(10.3, coarse, { pitch: 2 }).preset, "custom");
  assert.equal(patchThreadSettings(10.3, coarse, { clearance: 0 }).preset, "fdm-coarse");
});

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
