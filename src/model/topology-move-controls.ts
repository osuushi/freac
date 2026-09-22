import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { replayPointerModifiers } from "../sketch/modifier-pointer.js";
import type { Vector } from "../sketch/planes.js";
import { snapRotation } from "../sketch/rotation-snap.js";
import { numericFocus } from "../tools/menu-focus.js";
import { dragFrame } from "./body-drag.js";
import { BodyGizmo } from "./body-gizmo.js";
import { BodyPivotDrag } from "./body-pivot-drag.js";
import { axes } from "./body-placement.js";
import {
  movementCenter,
  movementNormal,
  movementRequest,
  movementTargets,
  type TopologyMovement,
} from "./topology-movement.js";

export class TopologyMoveControls {
  private gizmo: BodyGizmo;
  private pivotDrag: BodyPivotDrag;
  private accept = document.createElement("button");
  private cancelButton = document.createElement("button");
  private abort = new AbortController();
  private pivot: Vector = [0, 0, 0];
  private customPivot = false;
  private selection = "";
  private lease: InteractionLease | null = null;
  private edit: TopologyMovement | null = null;
  private direction: Vector = [1, 0, 0];
  private rotate = false;
  private value = 0;
  private valid = false;
  private invalid = false;
  private pending: TopologyMovement | null = null;
  private latest: TopologyMovement | null = null;
  private running: Promise<void> | null = null;
  private pointer: {
    id: number;
    x: number;
    y: number;
    moved: boolean;
    frame: ReturnType<typeof dragFrame>;
  } | null = null;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
    private kind: "faces" | "edges" = "faces",
  ) {
    this.gizmo = new BodyGizmo(overlay, this.start, kind);
    this.gizmo.root.classList.add(
      "topology-move-gizmo",
      kind === "faces" ? "face-move-gizmo" : "edge-move-gizmo",
    );
    this.pivotDrag = new BodyPivotDrag(
      editor,
      this.gizmo.pivot,
      () => this.pivot,
      (point) => {
        this.customPivot = true;
        this.pivot = point;
        editor.refresh();
      },
      () => {
        this.customPivot = false;
        editor.refresh();
      },
    );
    this.gizmo.pivot.title = "Drag to reposition the movement pivot; click to reset";
    this.accept.textContent = "✓";
    this.accept.setAttribute("aria-label", `Accept ${kind === "faces" ? "face" : "edge"} movement`);
    this.accept.className = "face-move-accept";
    this.cancelButton.textContent = "×";
    this.cancelButton.className = "face-move-cancel";
    this.cancelButton.setAttribute(
      "aria-label",
      `Cancel ${kind === "faces" ? "face" : "edge"} movement`,
    );
    this.gizmo.root.append(this.accept, this.cancelButton);
    this.accept.onclick = () => void this.finish();
    this.cancelButton.onclick = () => void this.cancel();
    this.events();
    editor.world.changed.add(this.update);
    this.update();
  }
  private start = (event: PointerEvent, axis: string, rotate: boolean): void => {
    if (event.button || this.editor.blocked || this.pointer || (rotate && this.kind === "edges"))
      return;
    this.direction =
      axis === "N"
        ? (movementNormal(this.editor, movementTargets(this.editor, this.kind)) ?? [0, 0, 1])
        : axes[axis];
    if (!this.lease) {
      const targets = movementTargets(this.editor, this.kind);
      if (!targets) return;
      this.lease = this.editor.interactions.acquire(
        this.kind === "faces" ? "face-move" : "edge-move",
        () => this.cancel(),
        () => this.finish(),
      );
      if (!this.lease) return;
      this.edit = {
        ...targets,
        pivot: [...this.pivot],
        axis: this.direction,
        angle: 0,
        translation: [0, 0, 0],
      };
    }
    if (this.lease.phase !== "editing") return;
    this.rotate = rotate;
    this.pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      frame: dragFrame(this.editor, this.pivot, axis, event.clientX, event.clientY, this.direction),
    };
    this.gizmo.input.setAttribute(
      "aria-label",
      `${this.kind === "faces" ? "Face" : "Edge"} ${rotate ? "rotation" : "translation"} ${axis === "N" ? "normal" : axis}`,
    );
    this.lease.capture(event.currentTarget as Element, event.pointerId);
    event.preventDefault();
    this.queue(0);
  };
  private queue(value: number): void {
    if (!this.edit || this.lease?.phase !== "editing") return;
    this.value = value;
    this.valid = false;
    this.invalid = !Number.isFinite(value);
    this.editor.notice = this.invalid
      ? "Enter a finite movement"
      : `Move ${this.kind} · Enter to accept · Escape to cancel`;
    if (this.invalid) this.latest = this.pending = null;
    else {
      this.latest = this.pending = {
        ...this.edit,
        axis: this.direction,
        angle: this.rotate ? value : 0,
        translation: this.rotate ? [0, 0, 0] : (this.direction.map((n) => n * value) as Vector),
      };
      if (!this.running) this.running = this.drain();
    }
    if (!numericFocus(this.gizmo.input)) this.gizmo.input.value = String(Number(value.toFixed(4)));
    this.editor.refresh();
  }
  private async drain(): Promise<void> {
    while (this.pending && this.lease?.phase === "editing") {
      const request = this.pending;
      this.pending = null;
      const success = await this.editor.store.request(movementRequest(request));
      if (this.lease?.phase !== "editing" || request !== this.latest) continue;
      this.valid = success;
      this.invalid = !success;
      if (success) this.lease.show(this.editor.store.candidate);
      // Keep the last valid image for a rejected request, but never accept it as
      // though it were the requested value. The backend clears rejected candidates.
      this.editor.refresh();
    }
    this.running = null;
    this.editor.refresh();
  }
  private move = (event: PointerEvent): void => {
    const pointer = this.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    pointer.moved ||= Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 3;
    if (!pointer.moved) return;
    let value = this.rotate
      ? snapRotation(
          pointer.frame.angle(event.clientX, event.clientY),
          event.shiftKey,
          event.altKey,
        )
      : pointer.frame.translation(event.clientX, event.clientY);
    if (!this.rotate && this.editor.gridSnap)
      value = Math.round(value / this.editor.world.spacing) * this.editor.world.spacing;
    this.queue(value);
  };
  private async finish(): Promise<boolean> {
    await this.running;
    const lease = this.lease;
    if (!lease || this.pointer || !this.valid || this.pending) return false;
    if (this.value === 0) {
      await this.cancel();
      return true;
    }
    if (!lease.close()) return false;
    const success = await this.editor.accept();
    if (!success) {
      lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    const latest = this.latest;
    if (this.customPivot && latest)
      this.pivot = latest.pivot.map((n, i) => n + latest.translation[i]) as Vector;
    this.end(lease);
    return true;
  }
  private async cancel(): Promise<void> {
    const lease = this.lease;
    if (!lease?.close()) return;
    this.pending = this.latest = null;
    this.pointer = null;
    lease.releaseCapture();
    lease.show(null);
    await this.editor.store.cancelPreview();
    await this.running;
    this.end(lease);
  }
  private end(lease: InteractionLease): void {
    this.lease = null;
    this.edit = this.latest = this.pending = null;
    this.invalid = false;
    this.gizmo.input.blur();
    this.gizmo.input.removeAttribute("aria-label");
    this.editor.notice = "";
    lease.release();
    this.editor.refresh();
  }
  private events(): void {
    const options = { signal: this.abort.signal };
    window.addEventListener("pointermove", this.move, options);
    replayPointerModifiers(this.abort.signal, () => !!this.pointer, this.move);
    window.addEventListener(
      "pointerup",
      (event) => {
        if (this.pointer?.id !== event.pointerId) return;
        this.move(event);
        const moved = this.pointer.moved;
        this.pointer = null;
        this.lease?.releaseCapture();
        if (!moved) {
          this.gizmo.input.focus();
          this.gizmo.input.select();
        }
        this.editor.refresh();
      },
      options,
    );
    this.gizmo.input.addEventListener(
      "input",
      () => this.queue(this.gizmo.input.value.trim() ? Number(this.gizmo.input.value) : NaN),
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
    window.addEventListener("pointercancel", () => void this.cancel(), options);
  }
  private update = (): void => {
    const targets = movementTargets(this.editor, this.kind),
      key = JSON.stringify(targets);
    if (!this.lease && key !== this.selection) {
      this.selection = key;
      this.customPivot = false;
    }
    if (!this.lease && !this.customPivot && targets)
      this.pivot = movementCenter(this.editor, targets) ?? this.pivot;
    const current = this.editor.interactions.current;
    this.gizmo.root.hidden =
      !!this.editor.world.active ||
      this.editor.modeling.tool !== "move" ||
      (!targets && !this.lease) ||
      (!!current &&
        current.kind !== (this.kind === "faces" ? "face-move" : "edge-move") &&
        current.kind !== "body-move");
    this.gizmo.input.hidden = !this.lease;
    this.accept.hidden = this.cancelButton.hidden = !this.lease;
    this.accept.disabled = !this.valid || !!this.running || this.value === 0;
    this.gizmo.root.dataset.geometryInvalid = String(this.invalid);
    this.gizmo.root.setAttribute("aria-busy", String(!!this.running));
    this.gizmo.input.setAttribute("aria-invalid", String(this.invalid));
    this.gizmo.update(
      this.editor,
      this.pivot,
      false,
      this.kind === "edges",
      movementNormal(this.editor, targets),
    );
  };
  dispose(): void {
    this.abort.abort();
    this.pivotDrag.dispose();
    this.editor.world.changed.delete(this.update);
    this.gizmo.dispose();
  }
}
