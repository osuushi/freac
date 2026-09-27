import assert from "node:assert/strict";
import test from "node:test";
import { PreviewHistories, previewState } from "../src/decorators/preview-feedback.js";
import { nextThreadResolution } from "../src/decorators/thread-preview.js";

test("live preview feedback retains three per-group samples and resets on changed settings", () => {
  const histories = new PreviewHistories();
  for (let i = 1; i <= 4; i++) histories.record("a", "settings-1", i * 20, { resolution: i });
  histories.record("b", "settings-1", 90, null);
  assert.deepEqual(histories.feedback("a", "settings-1", 50), {
    targetMs: 50,
    history: [2, 3, 4].map((i) => ({ durationMs: i * 20, state: { resolution: i } })),
  });
  assert.deepEqual(histories.feedback("a", "settings-2", 50).history, []);
  histories.record("a", "settings-2", 35, { resolution: 5 });
  assert.equal(histories.feedback("a", "settings-2", 50).history.length, 1);
  histories.retain(new Set(["a"]));
  assert.deepEqual(histories.feedback("b", "settings-1", 50).history, []);
});

test("preview state is bounded JSON and thread resolution follows measured cost", () => {
  assert.deepEqual(previewState({ turns: [1, 2] }), { turns: [1, 2] });
  assert.equal(previewState(null), null);
  assert.throws(() => previewState({ data: "x".repeat(16 * 1024) }), /16 KiB/);
  assert.deepEqual(nextThreadResolution({ targetMs: 100, history: [] }), {
    segments: 12,
    samples: 6,
  });
  assert.deepEqual(
    nextThreadResolution({
      targetMs: 100,
      history: [{ durationMs: 400, state: { segments: 32, samples: 12 } }],
    }),
    { segments: 18, samples: 7 },
  );
  assert.deepEqual(
    nextThreadResolution({
      targetMs: 100,
      history: [{ durationMs: 25, state: { segments: 16, samples: 8 } }],
    }),
    { segments: 22, samples: 11 },
  );
});
