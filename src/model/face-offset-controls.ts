import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { AxialDrag } from "./axial-drag.js";
import type { BodyFaceOffset, Face } from "./body.js";
import { CleanupAvailability } from "./cleanup-availability.js";
import {
  expandFaceTargets,
  offsetHandle,
  offsetTargets,
  sharedBlend,
} from "./face-offset-targets.js";
import { FaceOffsetWidget } from "./face-offset-widget.js";
import { OffsetPlacement } from "./offset-placement.js";

export class FaceOffsetControls {
  private widget: FaceOffsetWidget;
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private faces: BodyFaceOffset["faces"] = [];
  private axis: ReturnType<typeof offsetHandle> | null = null;
  private placement = new OffsetPlacement();
  private cylinder: Face["cylinder"] = null;
  private diameter = false;
  private blend: Face["blend"] = null;
  private distance = 0;
  private valid = false;
  private invalid = false;
  private pending: BodyFaceOffset | null = null;
  private latest: BodyFaceOffset | null = null;
  private running: Promise<void> | null = null;
  private drag: AxialDrag;
  private cleanup: CleanupAvailability;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.widget = new FaceOffsetWidget(
      overlay,
      () => void this.finish(),
      () => void this.cancel(),
    );
    this.cleanup = new CleanupAvailability(this.widget.cleanup, () => {
      if (this.lease?.phase !== "editing") return;
      this.running = this.checkCleanup();
    });
    this.widget.cleanup.onclick = () => void this.finish(true);
    const options = { signal: this.abort.signal };
    this.drag = new AxialDrag(editor, this.widget.handle, this.abort.signal, {
      begin: () => this.begin(),
      lease: () => this.lease,
      axis: () => this.axis,
      value: () => this.distance,
      queue: (value) => this.queue(value),
      focus: () => {
        this.widget.input.focus();
        this.widget.input.select();
      },
      modifySelection: true,
    });
    this.widget.handle.addEventListener(
      "click",
      (event) => {
        if (event.detail === 0 && this.begin()) this.focus();
      },
      options,
    );
    this.widget.input.addEventListener("focus", () => this.begin(), options);
    this.widget.input.addEventListener(
      "input",
      () => {
        let value = this.widget.input.value.trim() ? Number(this.widget.input.value) : NaN;
        if (this.blend) value = (this.blend.radius - value) * this.blend.outward;
        else if (this.diameter && this.cylinder)
          value = (value / 2 - this.cylinder.radius) * this.cylinder.outward;
        this.queue(value);
      },
      options,
    );
    this.widget.quantity.addEventListener(
      "click",
      () => {
        if (!this.begin()) return;
        this.diameter = !this.diameter;
        this.widget.input.blur();
        editor.refresh();
        this.focus();
      },
      options,
    );
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
  private begin(): boolean {
    if (this.lease) return this.lease.phase === "editing";
    const selected = offsetTargets(this.editor);
    if (this.editor.blocked || this.editor.world.active || !selected || !this.axis) return false;
    this.lease = this.editor.interactions.acquire(
      "face-offset",
      () => this.cancel(),
      () => this.finish(),
    );
    if (!this.lease) return false;
    this.blend = sharedBlend(selected.faces);
    this.faces = expandFaceTargets(this.editor, selected.targets, !!this.blend);
    this.editor.modeling.targets = this.faces.map((t) => ({ kind: "face", ...t }));
    this.cylinder = selected.faces.length === 1 ? selected.faces[0].cylinder : null;
    this.diameter = !!this.cylinder && !this.blend;
    this.distance = 0;
    this.valid = true;
    this.latest = this.pending = null;
    this.editor.notice = this.blend
      ? "Resize fillet · drag outward to add material · enter radius · Enter to accept · Escape to cancel"
      : "Offset faces · positive adds material · Enter to accept · Escape to cancel";
    this.editor.modeling.hover = null;
    this.editor.bodiesVisible = true;
    this.editor.refresh();
    return true;
  }
  private focus(): void {
    this.editor.refresh();
    this.widget.input.focus();
    this.widget.input.select();
  }
  private queue(distance: number): void {
    if (this.lease?.phase !== "editing" || this.latest?.distance === distance) return;
    this.cleanup.reset(Number.isFinite(distance) && distance !== 0);
    this.invalid = !Number.isFinite(distance);
    this.distance = distance;
    this.valid = false;
    if (!Number.isFinite(distance)) {
      this.latest = this.pending = null;
      this.lease.show(null);
      this.editor.notice = "Enter a finite face offset";
      this.editor.refresh();
      return;
    }
    this.editor.notice = this.blend
      ? "Resize fillet · drag outward to add material · enter radius · Enter to accept · Escape to cancel"
      : "Offset faces · positive adds material · Enter to accept · Escape to cancel";
    this.latest = this.pending = {
      faces: this.faces,
      distance,
      ...(this.blend ? { radius: this.blend.radius - distance * this.blend.outward } : {}),
    };
    if (!this.running) this.running = this.drain();
    else this.editor.store.supersedePreview();
    this.editor.refresh();
  }
  private async drain(): Promise<void> {
    while (this.pending && this.lease?.phase === "editing") {
      const request = this.pending;
      this.pending = null;
      const success = await this.editor.store.request({ kind: "offset-faces", operation: request });
      if (this.lease?.phase === "editing" && this.latest) {
        if (success) this.lease.show(this.editor.store.candidate);
        if (request !== this.latest) continue;
        if (success) {
          const distance = this.editor.store.offsetDistance ?? request.distance;
          this.invalid = distance !== request.distance;
          if (this.invalid) {
            this.widget.input.blur();
            this.editor.notice = "Offset stopped at the last verified position";
          }
          this.distance = distance;
          this.editor.modeling.targets = (this.editor.store.offsetSelection ?? this.faces).map(
            (face) => ({ kind: "face", ...face }),
          );
        }
        if (!success) this.invalid = true;
        this.valid = success;
        this.lease.show(success ? this.editor.store.candidate : null);
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
  private async finish(cleanup = false): Promise<boolean> {
    await this.running;
    const lease = this.lease;
    if (this.drag.active || !lease || !this.valid) return false;
    if (Math.abs(this.distance) < 1e-8) {
      await this.cancel();
      return true;
    }
    if (!lease.close()) return false;
    const success = await this.editor.accept(cleanup);
    if (!success) {
      lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    this.end(lease);
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
    this.editor.modeling.targets = this.faces.map((face) => ({ kind: "face", ...face }));
    this.end(lease);
  }
  private end(lease: InteractionLease): void {
    this.lease = null;
    this.widget.input.blur();
    this.cleanup.reset();
    this.distance = 0;
    this.invalid = false;
    this.editor.notice = "";
    lease.release();
    this.editor.refresh();
  }
  private update = (): void => {
    this.cleanup.update(!!this.lease && this.distance !== 0, this.editor.blocked || !this.valid);
    if (!this.lease) {
      const selected = offsetTargets(this.editor);
      if (
        this.editor.world.active ||
        this.editor.interactions.current ||
        this.editor.modeling.tool !== "offset" ||
        !selected
      ) {
        this.widget.root.hidden = true;
        return;
      }
      this.axis =
        this.placement.choose(selected.faces[0], this.editor.world.camera) ??
        offsetHandle(this.editor, selected.faces[0]);
      this.cylinder = selected.faces.length === 1 ? selected.faces[0].cylinder : null;
      this.blend = sharedBlend(selected.faces);
      this.diameter = !!this.cylinder && !this.blend;
    }
    if (this.axis)
      this.widget.update(
        this.editor,
        this.axis,
        !!this.lease,
        this.distance,
        this.cylinder,
        this.diameter,
        this.valid,
        this.blend,
        this.invalid,
      );
  };
  dispose(): void {
    this.cleanup.reset();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.widget.dispose();
  }
}
