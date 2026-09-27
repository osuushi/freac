import assert from "node:assert/strict";
import test from "node:test";
import { PreviewFade } from "../src/decorators/preview-fade.js";

test("stale preview finishes fading in before fading out", () => {
  const fade = new PreviewFade(1000);
  fade.stale(1040);
  assert.equal(fade.opacity(1050), 0.5);
  assert.equal(fade.opacity(1100), 1);
  assert.equal(fade.opacity(1200), 0.5);
  assert.equal(fade.opacity(1300), 0);
  assert.equal(fade.animating(1299), true);
  assert.equal(fade.animating(1300), false);
});

test("a newer preview immediately fades out a partly arrived one", () => {
  const old = new PreviewFade(1000);
  old.stale(1020);
  old.replace(1050);
  const next = new PreviewFade(1050);
  assert.equal(old.opacity(1050), 0.5);
  assert.equal(old.opacity(1150), 0.25);
  assert.equal(old.opacity(1250), 0);
  assert.equal(next.opacity(1100), 0.5);
  assert.equal(next.opacity(1150), 1);
});

test("an identical support restores a stale preview without replacing it", () => {
  const fade = new PreviewFade(1000);
  fade.stale(1100);
  assert.equal(fade.opacity(1200), 0.5);
  fade.restore(1200);
  assert.equal(fade.opacity(1250), 0.75);
  assert.equal(fade.opacity(1300), 1);
});
