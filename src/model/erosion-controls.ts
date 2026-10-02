import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { ModelingTarget } from "../sketch/model-selection-state.js";
import type { Vector } from "../sketch/planes.js";
import { AxialDrag } from "./axial-drag.js";
import type { BodyErosion } from "./body.js";
import { erosionPreview } from "./erosion-preview.js";
import { ErosionWidget } from "./erosion-widget.js";
import { offsetHandle } from "./face-offset-targets.js";

/** Erode owns a temporary preview; the document changes only on acceptance. */
export class ErosionControls {
  private widget: ErosionWidget;
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private ids: string[] = [];
  private original: ModelingTarget[] = [];
  private axis: { center: Vector; normal: Vector } | null = null;
  private thickness = 1;
  private allowancePercent = 50;
  private keepOriginals = true;
  private valid = false;
  private invalid = false;
  private count: number | null = null;
  private suggestedAllowance: number | null = null;
  private pending: BodyErosion | null = null;
  private latest: BodyErosion | null = null;
  private running: Promise<void> | null = null;
  private drag: AxialDrag;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.widget = new ErosionWidget(
      overlay,
      () => void this.finish(),
      () => void this.cancel(),
      () => {
        if (!this.begin()) return;
        this.keepOriginals = !this.keepOriginals;
        this.queue(this.thickness, this.allowancePercent);
      },
      () => {
        if (this.suggestedAllowance !== null) this.queue(this.thickness, this.suggestedAllowance);
      },
    );
    const options = { signal: this.abort.signal };
    this.drag = new AxialDrag(editor, this.widget.handle, this.abort.signal, {
      begin: () => this.begin(),
      lease: () => this.lease,
      axis: () => this.axis,
      value: () => (Number.isFinite(this.thickness) ? this.thickness : 0),
      queue: (value) => this.queue(Math.max(0.001, value), this.allowancePercent),
      focus: () => this.focus(),
    });
    this.widget.handle.addEventListener(
      "click",
      (event) => {
        if (event.detail === 0 && this.begin()) this.focus();
      },
      options,
    );
    for (const input of [this.widget.thickness, this.widget.allowance]) {
      input.addEventListener("focus", () => this.begin(), options);
      input.addEventListener(
        "input",
        () => {
          const value = input.value.trim() ? Number(input.value) : NaN;
          this.queue(
            input === this.widget.thickness ? value : this.thickness,
            input === this.widget.allowance ? value : this.allowancePercent,
          );
        },
        options,
      );
    }
    onModelKeydown(
      (event) => {
        if (!this.lease || !["Enter", "Escape"].includes(event.key)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape") void this.cancel();
        else void this.finish();
      },
      { ...options, capture: true },
    );
    editor.world.changed.add(this.update);
    this.update();
  }
  private focus(): void {
    this.widget.thickness.focus();
    this.widget.thickness.select();
  }
  private begin(): boolean {
    if (this.lease) return this.lease.phase === "editing";
    const resolved = this.editor.modeling.resolve("erode");
    if (this.editor.blocked || !resolved.available || !this.axis) return false;
    this.original = [...this.editor.modeling.targets];
    this.ids = resolved.inputs.map((body) => body.id);
    this.lease = this.editor.interactions.acquire(
      "erode",
      () => this.cancel(),
      () => this.finish(),
      { navigation: "when-released" },
    );
    if (!this.lease) return false;
    this.valid = this.invalid = false;
    this.thickness = 1;
    this.allowancePercent = 50;
    this.keepOriginals = true;
    this.count = null;
    this.suggestedAllowance = null;
    this.latest = this.pending = null;
    this.editor.modeling.hover = null;
    this.editor.bodiesVisible = true;
    this.editor.notice = "Erode · Minimum thickness · Extra allowance simplifies the result";
    this.queue(this.thickness, this.allowancePercent);
    this.editor.refresh();
    return true;
  }
  private queue(thickness: number, allowancePercent: number): void {
    const allowance = allowancePercent < 0 ? NaN : (thickness * allowancePercent) / 100;
    if (
      this.lease?.phase !== "editing" ||
      (thickness === this.latest?.thickness &&
        allowancePercent === this.allowancePercent &&
        this.keepOriginals === this.latest?.keepOriginals)
    )
      return;
    this.thickness = thickness;
    this.allowancePercent = allowancePercent;
    this.valid = false;
    this.count = null;
    this.suggestedAllowance = null;
    this.invalid =
      !Number.isFinite(thickness) || !Number.isFinite(allowance) || thickness < 0 || allowance < 0;
    this.latest = this.pending = {
      ids: this.ids,
      thickness,
      allowance,
      keepOriginals: this.keepOriginals,
    };
    if (this.running) this.editor.store.supersedePreview(true);
    else this.running = this.drain();
    this.editor.refresh();
  }
  private async drain(): Promise<void> {
    while (this.pending && this.lease?.phase === "editing") {
      const request = this.pending;
      this.pending = null;
      const zero =
        request.thickness === 0 && Number.isFinite(request.allowance) && request.allowance >= 0;
      const success = await this.editor.store.request(
        zero ? { kind: "discard" } : { kind: "erode", operation: request },
      );
      if (this.lease?.phase === "editing" && request === this.latest) {
        this.valid = success;
        this.invalid = !success;
        const suggested = this.editor.store.erosionAllowance;
        this.suggestedAllowance =
          !success && suggested !== undefined && request.thickness > 0
            ? Math.ceil((suggested / request.thickness) * 10) * 10
            : null;
        this.showPreview(success && !zero);
        if (success) this.editor.notice = "Erode · Enter to accept · Escape to cancel";
      }
      this.editor.refresh();
    }
    this.running = null;
    this.editor.refresh();
  }
  private showPreview(show: boolean): void {
    const candidate = show ? this.editor.store.candidate : null;
    if (!candidate || !this.latest) {
      this.lease?.show(null);
      return;
    }
    const preview = erosionPreview(candidate, this.editor.store.data, this.latest);
    this.count = preview.count;
    this.lease?.show(preview.document);
  }
  private async finish(): Promise<boolean> {
    await this.running;
    const lease = this.lease;
    if (!lease || this.drag.active) return false;
    if (!this.latest || (this.thickness === 0 && !this.invalid)) {
      await this.cancel();
      return true;
    }
    if (!this.valid || !lease.close()) return false;
    const accepted = new Set(this.editor.store.data.bodies?.map((body) => body.id));
    if (!(await this.editor.accept())) {
      lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    const copies = this.editor.store.data.bodies?.filter((body) => !accepted.has(body.id)) ?? [];
    if (copies.length && this.keepOriginals) {
      for (const id of this.ids) this.editor.visibility.hide(id);
      for (const body of copies) this.editor.visibility.show(body.id);
    }
    this.editor.modeling.targets = copies.length
      ? copies.map((body) => ({ kind: "body", body: body.id }))
      : this.original.filter(
          (target) =>
            "body" in target &&
            this.editor.store.data.bodies?.some((body) => body.id === target.body),
        );
    this.end(lease);
    return true;
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
    this.editor.modeling.targets = this.original;
    this.end(lease);
  }
  private end(lease: InteractionLease): void {
    this.widget.thickness.blur();
    this.widget.allowance.blur();
    this.lease = null;
    this.editor.modeling.setTool(null);
    this.editor.notice = "";
    lease.release();
    this.editor.refresh();
  }
  private update = (): void => {
    if (!this.lease) {
      const resolved = this.editor.modeling.resolve("erode");
      if (
        this.editor.world.active ||
        this.editor.interactions.current ||
        this.editor.modeling.tool !== "erode" ||
        !resolved.available
      ) {
        this.widget.root.hidden = true;
        return;
      }
      const body = resolved.inputs[0];
      const face = body.faces[0];
      const handle =
        face && (face.plane || face.cylinder || face.offsetHandle)
          ? offsetHandle(this.editor, face)
          : null;
      this.axis = handle
        ? {
            center: handle.center,
            normal: [-handle.normal[0], -handle.normal[1], -handle.normal[2]],
          }
        : { center: body.center, normal: [0, 0, -1] };
      this.begin();
    }
    if (!this.axis) {
      this.widget.root.hidden = true;
      return;
    }
    this.widget.update(
      this.editor,
      this.axis,
      {
        thickness: this.thickness,
        allowancePercent: this.allowancePercent,
        keepOriginals: this.keepOriginals,
      },
      !!this.lease,
      this.valid,
      !!this.lease && this.invalid,
      this.lease ? this.count : null,
      this.lease ? this.suggestedAllowance : null,
    );
  };
  dispose(): void {
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.widget.dispose();
  }
}
