import type { SketchEditor } from "./editor.js";
import {
  emptySelection,
  type HistorySelection,
  type SelectionChanges,
} from "./history-selection.js";

/** Buffers completed UI intent for serialized writes into the owner's history. */
export class SelectionHistory {
  private baseline = emptySelection();
  private steps: HistorySelection[] = [];
  private settling = false;
  private restoring = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private editor: SketchEditor) {}
  get pending(): boolean {
    return this.steps.length > 0;
  }
  private capture(): HistorySelection {
    return structuredClone({
      workspace: this.editor.world.workspace,
      sketch: this.editor.selected.targets,
      modeling: this.editor.modeling.targets,
    });
  }
  observe(): void {
    if (
      this.restoring ||
      this.settling ||
      this.editor.store.busy ||
      this.editor.store.scriptRunning ||
      this.editor.interactions.current
    )
      return;
    const next = this.capture();
    const previous = this.steps.at(-1) ?? this.baseline;
    if (
      JSON.stringify([next.sketch, next.modeling]) ===
      JSON.stringify([previous.sketch, previous.modeling])
    ) {
      // Navigation alone is not a selection operation.
      previous.workspace = next.workspace;
      return;
    }
    this.steps.push(next);
    queueMicrotask(() => this.editor.store.syncSelection());
  }
  take(): SelectionChanges {
    if (this.settling) this.settle();
    this.observe();
    const changes = { baseline: this.baseline, steps: this.steps };
    this.baseline = this.steps.at(-1) ?? this.baseline;
    this.steps = [];
    return structuredClone(changes);
  }
  accepted(): void {
    this.steps = [];
    this.settling = true;
    clearTimeout(this.timer);
    // Let the accepting controller finish its result selection and release its lease.
    this.timer = setTimeout(() => this.settle(), 0);
  }
  private settle(): void {
    clearTimeout(this.timer);
    this.baseline = this.capture();
    this.settling = false;
    queueMicrotask(() => this.editor.store.syncSelection());
  }
  restore(selection: HistorySelection): void {
    this.restoring = true;
    try {
      const editor = this.editor;
      const workspace = selection.workspace;
      if (workspace) {
        if (JSON.stringify(workspace) !== JSON.stringify(editor.world.workspace))
          editor.world.enterWorkspace(structuredClone(workspace));
      } else if (editor.world.workspace) editor.world.exit();
      // Workspace entry clears old targets during its draw; restore only afterwards.
      editor.modeling.sync(editor.store.data);
      editor.selectTargets(selection.sketch);
      editor.modeling.targets = structuredClone(selection.modeling);
      editor.tool = "select";
      editor.creationArmed = false;
      editor.modeling.alternatives = [];
      editor.modeling.hover = null;
      editor.refresh();
      this.baseline = this.capture();
      this.steps = [];
    } finally {
      this.restoring = false;
    }
  }
}
