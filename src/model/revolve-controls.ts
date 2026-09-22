import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { LiftSource, Revolution } from "./body.js";
import { extrusionAxis } from "./extrude-axis.js";
import { ExtrudeTargets } from "./extrude-targets.js";
import { axisInPlane, pickRevolveAxis, type RevolveAxis } from "./revolve-axis.js";
import { installRevolveDrag } from "./revolve-drag.js";
import { RevolveWidget } from "./revolve-widget.js";

export class RevolveControls {
  readonly widget: RevolveWidget;
  lease: InteractionLease | null = null;
  frame: ReturnType<typeof extrusionAxis> = null;
  axis: RevolveAxis | null = null;
  angle = 360;
  height = 0;
  private picking = false;
  private hover: RevolveAxis | null = null;
  private abort = new AbortController();
  private sources: LiftSource[] = [];
  private mode: Revolution["mode"] = "auto";
  private targets: ExtrudeTargets;
  private valid = false;
  private lastGood = "";
  private inputError = "";
  private pending: Revolution | null = null;
  private latest: Revolution | null = null;
  private running: Promise<void> | null = null;
  get active(): boolean {
    return !!this.lease;
  }
  constructor(
    readonly editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.targets = new ExtrudeTargets(editor, () => {
      if (this.mode === "auto") this.mode = editor.store.booleanMode ?? "auto";
      this.queue();
    });
    this.widget = new RevolveWidget((mode) => {
      this.mode = mode;
      this.queue();
    });
    this.widget.options.append(this.targets.root);
    overlay.append(this.widget.root);
    this.widget.entry.onclick = () => this.begin();
    this.widget.axis.onclick = () => {
      if (editor.blocked) return;
      this.picking = true;
      this.hover = null;
      this.latest = null;
      this.valid = false;
      this.lease?.show(null);
      editor.notice = "Choose a straight edge, cylindrical face or world axis in the profile plane";
      editor.refresh();
    };
    this.widget.cleanup.onclick = () => void this.finish(true);
    this.widget.accept.onclick = () => void this.finish();
    for (const key of ["angle", "height"] as const)
      this.widget[key].addEventListener(
        "input",
        () => {
          const field = this.widget[key];
          this[key] = field.value.trim() ? Number(field.value) : NaN;
          this.queue();
        },
        { signal: this.abort.signal },
      );
    this.installPicking();
    this.installKeys();
    installRevolveDrag(this, this.abort.signal);
    editor.world.changed.add(this.update);
    this.update();
  }
  begin(): void {
    const editor = this.editor;
    if (editor.blocked || editor.interactions.current || editor.world.active) return;
    this.frame = extrusionAxis(editor);
    if (!this.frame) return;
    const resolution = editor.modeling.resolve("revolve");
    if (!resolution.available) return;
    this.sources = resolution.inputs;
    this.lease = editor.interactions.acquire(
      "revolve",
      () => this.cancel(),
      () => this.finish(),
    );
    if (!this.lease) return;
    this.axis = this.hover = null;
    this.lastGood = this.inputError = "";
    this.angle = 360;
    this.height = 0;
    this.mode = "auto";
    this.picking = true;
    this.valid = false;
    this.targets.reset();
    this.latest = null;
    editor.notice = "Choose a straight edge, cylindrical face or world axis in the profile plane";
    editor.refresh();
  }
  private installPicking(): void {
    const canvas = this.editor.world.canvas,
      options = { signal: this.abort.signal, capture: true };
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (!this.picking || !this.lease || event.buttons) return;
        const axis = pickRevolveAxis(this.editor, { x: event.clientX, y: event.clientY });
        this.hover =
          axis && this.frame && axisInPlane(axis, this.frame.center, this.frame.normal)
            ? axis
            : null;
        this.editor.refresh();
      },
      options,
    );
    canvas.addEventListener(
      "pointerleave",
      () => {
        if (!this.picking || !this.hover) return;
        this.hover = null;
        this.editor.refresh();
      },
      options,
    );
    canvas.addEventListener(
      "click",
      (event) => {
        if (!this.picking || !this.lease || event.button || event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const axis = pickRevolveAxis(this.editor, { x: event.clientX, y: event.clientY });
        if (!axis || !this.frame) return;
        if (!axisInPlane(axis, this.frame.center, this.frame.normal)) {
          this.editor.message = "Choose an axis in the profile plane";
          this.editor.refresh();
          return;
        }
        this.axis = axis;
        this.picking = false;
        this.editor.notice = "Revolve · angle and total height · Enter accepts · Escape cancels";
        this.queue();
      },
      options,
    );
  }
  private installKeys(): void {
    onModelKeydown(
      (event) => {
        if (!this.lease) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          void this.cancel();
        } else if (event.key === "Enter") {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (event.target instanceof HTMLInputElement) {
            event.target.blur();
            this.editor.world.canvas.focus();
          } else void this.finish();
        } else if (!(event.target instanceof HTMLInputElement)) {
          const mode = ({ u: "union", s: "subtract", i: "intersect", n: "new" } as const)[
            event.key.toLowerCase() as "u"
          ];
          if (mode) {
            event.preventDefault();
            this.mode = mode;
            this.queue();
          }
          if (mode) event.stopImmediatePropagation();
        }
      },
      { signal: this.abort.signal, capture: true },
    );
  }
  queue(): void {
    if (!this.axis || !this.lease || this.picking) return;
    if (
      !Number.isFinite(this.angle) ||
      !Number.isFinite(this.height) ||
      Math.abs(this.angle) < 1e-7 ||
      (this.height === 0 && Math.abs(this.angle) > 360)
    ) {
      this.valid = false;
      this.pending = this.latest = null;
      this.inputError =
        this.height === 0 && Math.abs(this.angle) > 360
          ? "Set a nonzero height for more than one revolution"
          : "Enter a nonzero angle and a finite height";
      this.failure(this.inputError);
      this.editor.refresh();
      return;
    }
    this.inputError = "";
    const request: Revolution = {
      sources: this.sources,
      axis: this.axis,
      angle: this.angle,
      height: this.height,
      mode: this.mode,
      targets: this.targets.selected,
      eligibleTargets: this.targets.eligible,
    };
    if (JSON.stringify(request) === JSON.stringify(this.latest)) return;
    this.valid = false;
    this.pending = this.latest = request;
    if (!this.running) this.running = this.drain();
  }
  private async drain(): Promise<void> {
    while (this.pending && this.lease?.phase === "editing") {
      const request = this.pending;
      this.pending = null;
      const success = await this.editor.store.request({ kind: "revolve", revolution: request });
      if (this.lease?.phase === "editing" && this.latest) {
        this.valid = success && request === this.latest;
        if (success) {
          this.lease.show(this.editor.store.candidate);
          this.lastGood = `${request.angle}°, height ${request.height} mm`;
        } else if (request === this.latest) this.failure(this.editor.message);
        // Keep the previous valid presentation, but never accept it for failed input.
      }
      if (this.inputError) this.failure(this.inputError);
      this.editor.refresh();
    }
    this.running = null;
  }
  private failure(message: string): void {
    this.editor.message =
      message +
      (this.lease?.candidate && this.lastGood
        ? ` · Showing last valid preview: ${this.lastGood}`
        : "");
  }
  async finish(cleanup = false): Promise<boolean> {
    await this.running;
    if (this.lease && this.picking && !this.latest) {
      await this.cancel();
      return true;
    }
    if (!this.valid || this.picking || !this.lease?.close()) return false;
    const success = await this.editor.accept(cleanup);
    if (!success) {
      if (this.lease) this.lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    this.editor.visibility.setUsedSketchesVisible(this.editor.store.data, this.sources, false);
    this.release();
    return success;
  }
  private async cancel(): Promise<void> {
    if (!this.lease?.close()) return;
    this.pending = null;
    this.lease.releaseCapture();
    await this.editor.store.cancelPreview();
    await this.running;
    this.release();
  }
  private release(): void {
    this.picking = false;
    this.lease?.release();
    this.lease = null;
    this.editor.notice = "";
    this.editor.message = "";
    this.editor.refresh();
  }
  private update = (): void => {
    this.widget.cleanup.disabled = !this.valid || this.editor.blocked;
    const frame = this.active ? this.frame : extrusionAxis(this.editor);
    const mode = this.mode === "auto" ? this.editor.store.booleanMode : this.mode;
    this.widget.update(
      this.editor,
      frame?.center ?? null,
      this.active,
      this.picking,
      this.picking ? this.hover : this.axis,
      this.angle,
      this.height,
      mode,
      this.valid,
      this.sources,
    );
    if (!this.active) this.widget.root.hidden = true;
    this.targets.update(
      this.active && !this.picking && mode !== "new" && !!this.editor.store.data.bodies?.length,
    );
  };
  dispose(): void {
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.widget.root.remove();
  }
}
