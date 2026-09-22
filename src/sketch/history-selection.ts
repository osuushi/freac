import type { ModelingTarget } from "./model-selection.js";
import type { PlaneFrame } from "./planes.js";
import type { SelectionTarget } from "./selected-targets.js";

/** Selection context is transient UI data, never part of the saved document. */
export interface HistorySelection {
  workspace: { key: string; frame: PlaneFrame; sketchId?: string } | null;
  sketch: readonly SelectionTarget[];
  modeling: ModelingTarget[];
}
export interface SelectionChanges {
  baseline: HistorySelection;
  steps: HistorySelection[];
}
export const emptySelection = (): HistorySelection => ({
  workspace: null,
  sketch: [],
  modeling: [],
});
