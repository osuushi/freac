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

test("FDM presets flatten the rod crest and hole groove without filling the hole", () => {
  for (const [preset, pitch] of [
    ["fdm-fine", 1],
    ["fdm-coarse", 1.5],
  ] as const) {
    const settings = threadDefaults(10.3, preset);
    assert.equal(settings.pitch, pitch);
    assert.equal(settings.profile, "triangle");
    assert.equal(threadDepth(settings), 1);
    assert.equal(settings.clearance, 0.05);
    assert.equal(settings.tipTruncation, 0.1);
    for (const cut of ["rod", "hole"] as const) {
      const profile = { ...settings, cut };
      const sharp = { ...profile, tipTruncation: 0 };
      const crestPhase = cut === "rod" ? 0 : 0.5;
      const oppositePhase = cut === "rod" ? 0.5 : 0;
      const at = (phase: number, outward: 1 | -1, current = profile) =>
        threadRadius(5.15, 0, phase * pitch, current, outward, [0, 10]);
      assert.ok(Math.abs(at(crestPhase, 1) - at(crestPhase, 1, sharp) + 0.1) < 1e-12);
      assert.ok(Math.abs(at(crestPhase, -1) - at(crestPhase, -1, sharp)) < 1e-12);
      for (const outward of [1, -1] as const)
        assert.ok(Math.abs(at(oppositePhase, outward) - at(oppositePhase, outward, sharp)) < 1e-12);
      for (const phase of cut === "rod"
        ? [0, 0.025, 0.05, 0.95, 0.975]
        : [0.45, 0.475, 0.5, 0.525, 0.55]) {
        assert.ok(Math.abs(at(phase, 1) - at(crestPhase, 1)) < 1e-12);
        assert.ok(Math.abs(at(phase, -1) - at(crestPhase, -1)) < 1e-12);
      }
      for (const phase of Array.from({ length: 41 }, (_, i) => i / 40)) {
        const rod = threadRadius(5.15, 0, phase * pitch, profile, 1, [0, 10]);
        const hole = threadRadius(5.15, 0, phase * pitch, profile, -1, [0, 10]);
        assert.ok(rod <= at(phase, 1, sharp) + 1e-12, "rod relief must remove material");
        assert.ok(hole >= at(phase, -1, sharp) - 1e-12, "hole relief must remove material");
        assert.ok(hole - rod >= settings.clearance - 1e-12);
      }
    }
    assert.deepEqual(patchThreadSettings(20, settings, { hand: "left" }), {
      ...settings,
      hand: "left",
    });
  }
  assert.equal(threadDefaults(10.3).preset, "fdm-fine");
  const coarse = patchThreadSettings(10.3, threadDefaults(10.3), { preset: "fdm-coarse" });
  assert.equal(coarse.pitch, 1.5);
  assert.equal(patchThreadSettings(10.3, coarse, { preset: "fdm-fine" }).pitch, 1);
  assert.equal(patchThreadSettings(10.3, coarse, { pitch: 2 }).preset, "custom");
  assert.equal(patchThreadSettings(10.3, coarse, { clearance: 0 }).preset, "fdm-coarse");
  assert.equal(patchThreadSettings(10.3, coarse, { tipTruncation: 0 }).preset, "custom");
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
  delete (legacy as Partial<typeof legacy>).tipTruncation;
  assert.equal(threadSettings(legacy).layerHeight, 0.2);
  assert.equal(threadSettings(legacy).nozzleDiameter, 0.4);
  assert.equal(threadSettings(legacy).tipTruncation, 0);
  assert.equal(threadRadius(5, 0, 0.5, threadSettings(legacy), 1, [0, 10]), 4);
  assert.equal(patchThreadSettings(10, legacy, { preset: "fdm-fine" }).tipTruncation, 0.1);
  assert.throws(() => patchThreadSettings(10, legacy, { nozzleDiameter: NaN }), /nozzle/);
  assert.throws(() => patchThreadSettings(10, legacy, { layerHeight: 0 }), /layer/);
  assert.deepEqual(coarseMetric(11), { diameter: 10, pitch: 1.5, listed: false });
});
