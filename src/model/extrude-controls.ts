import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { AxialDrag } from "./axial-drag.js";
import type { Extrusion, LiftSource } from "./body.js";
import { CleanupAvailability } from "./cleanup-availability.js";
import { extrudeKeys } from "./extrude-keys.js";
import { ExtrudeTargets } from "./extrude-targets.js";
import { ExtrudeTwist } from "./extrude-twist.js";
import { ExtrudeWidget } from "./extrude-widget.js";

export class ExtrudeControls {
  private widget: ExtrudeWidget;
  get root(): HTMLDivElement {
    return this.widget.root;
  }
  private targets: ExtrudeTargets;
  private get input(): HTMLInputElement {
    return this.widget.input;
  }
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private sources: LiftSource[] = [];
  private mode: Extrusion["mode"] = "auto";
  private distance = 0;
  private symmetric = false;
  private pending: Extrusion | null = null;
  private latest: Extrusion | null = null;
  private running: Promise<void> | null = null;
  private valid = false;
  private drag: AxialDrag;
  private cleanup: CleanupAvailability;
  private twist: ExtrudeTwist;
  get active(): boolean {
    return !!this.lease;
  }
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.targets = new ExtrudeTargets(editor, () => {
      if (this.mode === "auto") this.mode = editor.store.booleanMode ?? "auto";
      this.queue(this.distance);
    });
    this.widget = new ExtrudeWidget(
      (mode) => {
        if (this.begin()) {
          this.mode = mode;
          this.queue(this.distance);
        }
      },
      () => {
        if (this.begin()) this.queue(this.distance);
      },
      (symmetric) => {
        if (this.begin()) this.queue(this.distance, symmetric);
      },
      () => void this.finish(),
      () => void this.cancel(),
    );
    this.twist = new ExtrudeTwist(
      editor,
      this.root,
      () => this.begin(),
      () => this.lease,
      () => {
        this.queue(this.distance);
        editor.refresh();
      },
      this.abort.signal,
    );
    this.widget.addQuantity(this.twist.row);
    this.cleanup = new CleanupAvailability(this.widget.cleanup, () => {
      // A debounce can expire after acceptance has started. Do not retain an
      // already-resolved early-return promise as the next gesture's running job.
      if (this.latest && this.valid && this.lease?.phase === "editing")
        this.running = this.checkCleanup();
    });
    this.widget.cleanup.onclick = () => void this.finish(true);
    this.root.append(this.targets.root);
    overlay.append(this.root);
    this.drag = new AxialDrag(editor, this.widget.handle, this.abort.signal, {
      begin: () => this.begin(),
      lease: () => this.lease,
      axis: () => this.widget.axis,
      value: () => this.distance,
      queue: (value, symmetric) => this.queue(value, symmetric),
      symmetric: () => this.symmetric,
      focus: () => {
        this.widget.input.focus();
        this.widget.input.select();
      },
      modifySelection: true,
    });
    this.installInputs();
    editor.world.changed.add(this.update);
    this.update();
  }
  private installInputs(): void {
    const editor = this.editor;
    const options = { signal: this.abort.signal };
    this.widget.handle.addEventListener(
      "click",
      (event) => {
        if (event.detail === 0 && this.begin()) {
          editor.refresh();
          this.input.focus();
          this.input.select();
        }
      },
      options,
    );
    this.input.addEventListener("focus", () => this.begin(), options);
    this.widget.draft.root.addEventListener("focusin", () => this.begin(), options);
    this.input.addEventListener(
      "input",
      () => {
        if (this.begin()) this.queue(this.input.value.trim() ? Number(this.input.value) : NaN);
      },
      options,
    );
    extrudeKeys(
      editor,
      this.root,
      {
        active: () => this.active,
        cancel: () => void this.cancel(),
        finish: () => void this.finish(),
        mode: (mode) => {
          this.mode = mode;
          this.queue(this.distance);
        },
      },
      this.abort.signal,
    );
  }
  private begin(): boolean {
    if (this.lease) return this.lease.phase === "editing";
    if (this.editor.blocked || this.editor.world.active || this.editor.modeling.tool !== "extrude")
      return false;
    const resolution = this.editor.modeling.resolve("extrude");
    if (!resolution.available) return false;
    this.sources = resolution.inputs;
    if (!this.sources.length) return false;
    this.lease = this.editor.interactions.acquire(
      "extrude",
      () => (this.twist.cancelGesture() ? undefined : this.cancel()),
      () => this.finish(),
    );
    this.latest = null;
    this.targets.reset();
    this.mode = "auto";
    this.widget.draft.reset();
    this.distance = 0;
    this.symmetric = false;
    this.valid = false;
    return !!this.lease;
  }
  private queue(value: number, symmetric = this.symmetric): void {
    this.symmetric = symmetric;
    if (
      !Number.isFinite(value) ||
      Math.abs(value) < 1e-8 ||
      !Number.isFinite(this.widget.draft.value.value) ||
      !Number.isFinite(this.twist.angle)
    ) {
      this.cleanup.reset();
      this.distance = value;
      this.valid = false;
      this.latest = this.pending = null;
      this.editor.store.supersedePreview(true);
      this.lease?.show(null);
      this.editor.refresh();
      return;
    }
    const request: Extrusion = {
      sources: this.sources,
      distance: value,
      symmetric: this.symmetric,
      draft: this.widget.draft.value,
      twist: this.twist.value,
      mode: this.mode,
      targets: this.targets.selected,
      eligibleTargets: this.targets.eligible,
    };
    // Pointer events within one grid step do not require another calculation.
    if (JSON.stringify(request) === JSON.stringify(this.latest)) return;
    this.cleanup.reset(Number.isFinite(value) && value !== 0);
    this.distance = value;
    this.valid = false;
    this.latest = this.pending = request;
    if (!this.running) this.running = this.drain();
    else this.editor.store.supersedePreview(true);
    this.editor.refresh();
  }
  private async drain(): Promise<void> {
    while (this.pending && this.lease?.phase === "editing") {
      const request = this.pending;
      this.pending = null;
      const success = await this.editor.store.request({ kind: "extrude", extrusion: request });
      if (request === this.latest && this.lease?.phase === "editing") {
        this.valid = success;
        if (success) this.lease.show(this.editor.store.candidate);
        else if (request === this.latest) this.lease.show(null);
      }
      this.editor.refresh();
    }
    this.running = null;
    if (this.valid && this.distance !== 0 && this.lease?.phase === "editing")
      this.cleanup.schedule();
    else this.cleanup.reset();
    this.editor.refresh();
  }
  private async checkCleanup(): Promise<void> {
    const request = this.latest;
    if (!request || !this.valid || this.lease?.phase !== "editing") return;
    const success = await this.editor.store.request({ kind: "check-cleanup" });
    if (request === this.latest && this.valid && this.lease?.phase === "editing")
      this.cleanup.resolve(this.editor.store.cleanupAvailable, success);
    if (this.pending) await this.drain();
    else this.running = null;
    this.editor.refresh();
  }
  async finish(cleanup = false): Promise<boolean> {
    await this.running;
    if (this.lease && !this.latest && this.distance === 0) {
      await this.cancel();
      return true;
    }
    if (!this.lease || !this.valid || !this.lease.close()) return false;
    const success = await this.editor.accept(cleanup);
    if (!success) {
      if (this.lease) this.lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    this.editor.visibility.setUsedSketchesVisible(this.editor.store.data, this.sources, false);
    this.lease.release();
    this.lease = null;
    this.input.blur();
    this.cleanup.reset();
    this.distance = 0;
    this.symmetric = false;
    this.twist.reset();
    this.editor.refresh();
    return success;
  }
  private async cancel(): Promise<void> {
    const lease = this.lease;
    if (!lease?.close()) return;
    this.pending = null;
    this.drag.reset();
    lease.releaseCapture();
    lease.show(null);
    await this.editor.store.cancelPreview();
    await this.running;
    lease.release();
    this.lease = null;
    this.input.blur();
    this.cleanup.reset();
    this.distance = 0;
    this.symmetric = false;
    this.twist.reset();
    this.editor.refresh();
  }
  private update = (): void => {
    this.cleanup.update(!!this.lease && this.distance !== 0, this.editor.blocked || !this.valid);
    const editor = this.editor;
    this.widget.update(
      editor,
      this.active,
      this.distance,
      this.mode === "auto" ? editor.store.booleanMode : this.mode,
      this.valid,
      this.twist.value,
      this.symmetric,
    );
    this.twist.update(this.widget.axis, this.active, this.distance, this.valid, this.symmetric);
    this.root.dataset.previewPending = String(
      this.active && !!this.latest && !this.valid && this.editor.store.working,
    );
    if (
      (!this.active && editor.modeling.tool !== "extrude") ||
      (editor.interactions.current && editor.interactions.current.kind !== "extrude")
    )
      this.root.hidden = true;
    this.targets.update(
      this.active &&
        (this.mode === "auto" ? editor.store.booleanMode : this.mode) !== "new" &&
        !!editor.store.data.bodies?.length,
    );
  };
  dispose(): void {
    this.cleanup.reset();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.root.remove();
  }
}
