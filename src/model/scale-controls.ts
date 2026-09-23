import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { modelingSketch } from "../sketch/model-selection.js";
import type { Vector } from "../sketch/planes.js";
import { toolCatalog } from "../tools/catalog.js";
import type { ScaleOperation, ScaleSource } from "./scale.js";
import { ScaleGestures } from "./scale-gestures.js";
import { scalePivot, scaleSelection } from "./scale-selection.js";
import { ScaleWidget } from "./scale-widget.js";
import { boxLocal, selectionBox, type TransformBox } from "./transform-box.js";

export class ScaleControls {
  private disposeTool: () => void;
  private widget: ScaleWidget;
  private gestures: ScaleGestures;
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private source: ScaleSource | null = null;
  private box: TransformBox | null = null;
  private pivot: Vector = [0, 0, 0];
  private originalIds = new Set<string>();
  private valid = false;
  private pending: ScaleOperation | null = null;
  private latest: ScaleOperation | null = null;
  private running: Promise<void> | null = null;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
    activate: () => void | Promise<void>,
  ) {
    this.disposeTool = toolCatalog(editor).register({
      id: "transform",
      label: "Transform",
      category: "Transform",
      shortcut: "M",
      aliases: ["move", "translate", "rotate", "resize", "scale", "non-uniform scale"],
      reason: () =>
        (editor.interactions.current && !editor.interactions.current.finish
          ? "Finish or cancel the current edit first"
          : null) ??
        (scaleSelection(editor) ||
        (!editor.world.active && modelingSketch(editor)) ||
        (editor.world.active && editor.selectionOwners.size)
          ? null
          : "Select sketch or solid geometry"),
      run: async () => {
        const current = editor.interactions.current;
        if (current && !(await current.finish?.())) {
          editor.message ||= "Finish or cancel the current edit before switching tools";
          return;
        }
        await activate();
      },
    });
    this.widget = new ScaleWidget(overlay);
    this.gestures = new ScaleGestures(
      editor,
      this.widget,
      () => {
        if (!this.lease) this.begin();
        return this.lease && this.box
          ? { pivot: this.pivot, factors: this.widget.values(), box: this.box, lease: this.lease }
          : null;
      },
      (factors) => {
        this.widget.setValues(factors);
        this.queue();
      },
    );
    this.widget.accept.onclick = () => void this.finish();
    this.widget.cancel.onclick = () => void this.cancel();
    this.widget.factors.forEach((input, index) => {
      input.oninput = () => {
        if (!this.lease) this.begin();
        if (this.widget.linked.checked)
          this.widget.factors.forEach((other, i) => {
            if (i !== index) other.value = input.value;
          });
        this.queue();
      };
    });
    this.events();
    editor.world.changed.add(this.update);
    this.update();
  }
  private begin(): void {
    const e = this.editor,
      source = scaleSelection(e);
    if (!source || e.blocked || e.interactions.current) return;
    const box = selectionBox(e, source);
    if (!box) return;
    this.lease = e.interactions.acquire(
      "scale",
      () => this.cancel(),
      () => this.finish(),
    );
    if (!this.lease) return;
    this.source = source;
    this.box = box;
    this.pivot = e.transformAnchor?.point ?? scalePivot(e);
    this.originalIds = new Set(e.sketch?.curves.map((c) => c.id));
    this.valid = true;
    this.latest = this.pending = null;
    e.message = "";
    e.notice = "Transform · Resize about the anchor · Enter to accept · Escape to cancel";
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
      if (!this.lease || !["Escape", "Enter"].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") void this.cancel();
      else void this.finish();
    }, options);
  }
  private queue(): void {
    if (this.lease?.phase !== "editing" || !this.source) return;
    const factors = this.widget.values();
    this.valid = false;
    this.pending = this.latest = null;
    const valid = factors.every((v) => Number.isFinite(v) && v > 0);
    this.widget.factors.forEach((input, i) => {
      input.setAttribute("aria-invalid", String(!Number.isFinite(factors[i]) || factors[i] <= 0));
    });
    if (valid) {
      this.pending = this.latest = { ...this.source, pivot: [...this.pivot], factor: 1, factors };
      if (!this.running) this.running = this.drain();
    } else this.editor.message = "Enter positive scale factors";
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
    if (this.source?.kind === "curves") {
      const source = this.source;
      const sketch = this.editor.store.data.sketches.find((s) => s.id === source.sketchId);
      const curves = sketch?.curves ?? [];
      const ids = source.ids.flatMap((id) => {
        const start = curves.findIndex((curve) => curve.id === id);
        if (start < 0) return [];
        const pieces = [id];
        for (let i = start + 1; i < curves.length && !this.originalIds.has(curves[i].id); i++)
          pieces.push(curves[i].id);
        return pieces;
      });
      this.editor.select(ids);
      this.editor.moveMode = true;
      if (this.box) {
        const local = boxLocal(this.box, this.pivot);
        this.editor.pivot = { x: local[0], y: local[1] };
      }
    }
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
    this.end(lease);
  }
  private end(lease: InteractionLease): void {
    this.lease = null;
    this.source = null;
    this.box = null;
    this.widget.setValues([1, 1, 1]);
    this.widget.factors.forEach((input) => {
      input.setAttribute("aria-invalid", "false");
    });
    this.editor.notice = "";
    lease.release();
    this.editor.refresh();
  }
  private update = (): void => {
    const e = this.editor,
      source = this.source ?? scaleSelection(e);
    const box = this.box ?? (source ? selectionBox(e, source) : null);
    const active = !!this.lease;
    const visible = !!box && (active || (!!e.transformAnchor?.active && !e.interactions.current));
    this.widget.update(
      visible,
      active,
      this.valid,
      e.blocked || !!this.running,
      active && this.lease?.phase !== "editing",
    );
    if (visible && box) {
      const factors = this.widget.values();
      this.widget.position(
        e,
        box,
        active ? this.pivot : (e.transformAnchor?.point ?? scalePivot(e)),
        factors.every((v) => Number.isFinite(v) && v > 0) ? factors : [1, 1, 1],
      );
    }
  };
  dispose(): void {
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.gestures.dispose();
    this.widget.dispose();
    this.disposeTool();
  }
}
