import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { Vector } from "../sketch/planes.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import type { ScaleOperation, ScaleSource } from "./scale.js";
import { ScaleGestures } from "./scale-gestures.js";
import { scalePivot, scaleSelection } from "./scale-selection.js";
import { ScaleWidget } from "./scale-widget.js";

export class ScaleControls {
  private disposeTool: () => void;
  private widget: ScaleWidget;
  private gestures: ScaleGestures;
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private source: ScaleSource | null = null;
  private pivot: Vector = [0, 0, 0];
  private previousSelection: SketchEditor["selected"]["targets"] = [];
  private previousModels: SketchEditor["modeling"]["targets"] = [];
  private valid = false;
  private pending: ScaleOperation | null = null;
  private latest: ScaleOperation | null = null;
  private running: Promise<void> | null = null;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.disposeTool = toolCatalog(editor).register({
      id: "scale",
      label: "Scale",
      category: "Transform",
      aliases: ["resize", "uniform scale"],
      reason: () =>
        idleReason(editor) ??
        (scaleSelection(editor) ? null : "Select compatible sketch geometry or solid geometry"),
      run: () => this.begin(),
    });
    this.widget = new ScaleWidget(overlay);
    this.gestures = new ScaleGestures(
      editor,
      this.widget,
      () =>
        this.lease
          ? { pivot: this.pivot, factor: Number(this.widget.factor.value), lease: this.lease }
          : null,
      (pivot, factor) => {
        this.pivot = pivot;
        this.widget.factor.value = String(factor);
        this.queue();
      },
    );
    this.widget.accept.onclick = () => void this.finish();
    this.widget.cancel.onclick = () => void this.cancel();
    this.widget.factor.oninput = () => this.queue();
    this.events();
    editor.world.changed.add(this.update);
    this.update();
  }
  private begin(): void {
    const e = this.editor,
      source = scaleSelection(e);
    if (!source || e.blocked || e.interactions.current) return;
    this.lease = e.interactions.acquire(
      "scale",
      () => this.cancel(),
      () => this.finish(),
    );
    if (!this.lease) return;
    this.source = source;
    this.pivot = scalePivot(e);
    this.previousSelection = e.selected.targets;
    this.previousModels = e.modeling.targets;
    this.widget.factor.value = "1";
    this.widget.factor.setAttribute("aria-invalid", "false");
    this.valid = true;
    this.latest = this.pending = null;
    e.select([]);
    e.modeling.targets = [];
    e.modeling.hover = null;
    e.message = "";
    e.notice = "Scale · Drag or enter a factor · Enter to accept · Escape to cancel";
    e.refresh();
  }
  private events(): void {
    const options = { signal: this.abort.signal, capture: true };
    for (const type of ["pointerdown", "click", "dblclick"] as const)
      this.editor.world.canvas.addEventListener(
        type,
        (event) => {
          if (!this.lease || event.button || event.ctrlKey || event.metaKey) return;
          event.preventDefault();
          event.stopImmediatePropagation();
        },
        options,
      );
    onModelKeydown((event) => {
      if (!this.lease) return;
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape") void this.cancel();
        else void this.finish();
      }
    }, options);
  }
  private queue(): void {
    if (this.lease?.phase !== "editing" || !this.source) return;
    const value = this.widget.factor.value.trim(),
      factor = value ? Number(value) : NaN;
    this.valid = false;
    this.pending = this.latest = null;
    const valid = Number.isFinite(factor) && factor > 0;
    this.widget.factor.setAttribute("aria-invalid", String(!valid));
    if (valid) {
      this.pending = this.latest = { ...this.source, pivot: [...this.pivot], factor };
      if (!this.running) this.running = this.drain();
    } else {
      this.editor.message = "Enter a positive scale factor";
    }
    this.editor.refresh();
  }
  private async drain(): Promise<void> {
    while (this.pending && this.lease?.phase === "editing") {
      const operation = this.pending;
      this.pending = null;
      const success = await this.editor.store.request({ kind: "scale", operation });
      if (this.lease?.phase === "editing" && operation === this.latest) {
        this.valid = success;
        if (success) this.lease.show(this.editor.store.candidate);
      }
      this.editor.refresh();
    }
    this.running = null;
    this.editor.refresh();
  }
  private async finish(): Promise<boolean> {
    await this.running;
    const lease = this.lease;
    if (!lease || !this.valid) return false;
    if (!this.latest) {
      await this.cancel();
      return true;
    }
    if (!lease.close()) return false;
    this.gestures.stop();
    if (!(await this.editor.accept())) {
      lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    this.restoreSelection();
    this.end(lease);
    return true;
  }
  private async cancel(): Promise<void> {
    const lease = this.lease;
    if (!lease?.close()) return;
    this.gestures.stop();
    this.pending = null;
    lease.show(null);
    await this.editor.store.cancelPreview();
    await this.running;
    this.restoreSelection();
    this.end(lease);
  }
  private restoreSelection(): void {
    this.editor.selectTargets(this.previousSelection);
    this.editor.modeling.targets = this.previousModels;
  }
  private end(lease: InteractionLease): void {
    this.lease = null;
    this.source = null;
    this.editor.notice = "";
    lease.release();
    this.editor.refresh();
  }
  private update = (): void => {
    const e = this.editor;
    this.widget.update(
      !!this.lease,
      this.valid,
      e.blocked || !!this.running,
      this.lease?.phase !== "editing",
    );
    if (this.lease) this.widget.position(e, this.pivot);
  };
  dispose(): void {
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.gestures.dispose();
    this.widget.dispose();
    this.disposeTool();
  }
}
