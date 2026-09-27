import type { PreviewFeedback } from "./preview-feedback.js";
import type { ThreadPreviewResolution } from "./thread-sampling.js";

function isResolution(value: unknown): value is ThreadPreviewResolution {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<ThreadPreviewResolution>;
  return (
    Number.isInteger(state.segments) &&
    Number.isInteger(state.samples) &&
    (state.segments ?? 0) >= 12 &&
    (state.samples ?? 0) >= 6
  );
}

/** Sweep work is roughly proportional to angular segments times axial samples. */
export function nextThreadResolution(
  feedback: PreviewFeedback,
): ThreadPreviewResolution | undefined {
  const previous = feedback.history.at(-1);
  if (!previous || !isResolution(previous.state)) return { segments: 12, samples: 6 };
  const ratio = Math.sqrt(feedback.targetMs / Math.max(1, previous.durationMs));
  const scale = Math.max(0.55, Math.min(1.4, ratio));
  return {
    segments: Math.max(12, Math.round(previous.state.segments * scale)),
    samples: Math.max(6, Math.round(previous.state.samples * scale)),
  };
}
