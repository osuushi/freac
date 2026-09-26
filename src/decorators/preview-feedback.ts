export interface PreviewSample<State = unknown> {
  durationMs: number;
  state: State | null;
}

export interface PreviewFeedback<State = unknown> {
  targetMs: number;
  history: readonly PreviewSample<State>[];
}

const maxPreviewStateBytes = 16 * 1024;
const historyLength = 3;

/** Preview state is a small JSON hint owned by the view, never document data. */
export function previewState(value: unknown): unknown | null {
  if (value == null) return null;
  const json = JSON.stringify(value);
  if (!json || new TextEncoder().encode(json).length > maxPreviewStateBytes)
    throw new Error("Decorator preview state must be JSON under 16 KiB");
  return JSON.parse(json);
}

export class PreviewHistories {
  private groups = new Map<string, { signature: string; samples: PreviewSample[] }>();

  feedback(id: string, signature: string, targetMs: number): PreviewFeedback {
    const group = this.groups.get(id);
    if (!group || group.signature !== signature) return { targetMs, history: [] };
    return { targetMs, history: group.samples };
  }

  record(id: string, signature: string, durationMs: number, state: unknown): void {
    if (!Number.isFinite(durationMs) || durationMs < 0)
      throw new Error("Invalid decorator preview duration");
    const previous = this.feedback(id, signature, 0).history;
    this.groups.set(id, {
      signature,
      samples: [...previous, { durationMs, state: previewState(state) }].slice(-historyLength),
    });
  }

  retain(ids: ReadonlySet<string>): void {
    for (const id of this.groups.keys()) if (!ids.has(id)) this.groups.delete(id);
  }
}
