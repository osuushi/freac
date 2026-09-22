import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { replayPointerModifiers } from "../sketch/modifier-pointer.js";
import type { Vector } from "../sketch/planes.js";
import { snapRotation } from "../sketch/rotation-snap.js";
import { numericFocus } from "../tools/menu-focus.js";
import type { Body, BodyTransform } from "./body.js";
import { selectedBodies } from "./body-actions.js";
import { bodySnap, dragFrame } from "./body-drag.js";
import { BodyGizmo } from "./body-gizmo.js";
import { BodyPivotDrag } from "./body-pivot-drag.js";
import { axes, bodyCenter, placedBodies } from "./body-placement.js";

type Session = {
  bodies: Body[];
  edit: BodyTransform;
  lease: InteractionLease;
  valid: boolean;
  value: number;
  axis: string;
  rotate: boolean;
  pivotOnly: boolean;
  explicitCopy: boolean;
};
export class BodyMoveControls {
  private gizmo: BodyGizmo;
  private pivotDrag: BodyPivotDrag;
  private snap = document.createElement("div");
  private abort = new AbortController();
  private pivot: Vector = [0, 0, 0];
  private pivotMode = false;
  private customPivot = false;
  private selection = "";
  private session: Session | null = null;
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
  ) {
    this.gizmo = new BodyGizmo(overlay, this.start);
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
        this.pivotMode = !this.pivotMode;
        editor.refresh();
      },
    );
    this.snap.className = "body-snap";
    this.snap.hidden = true;
    overlay.append(this.snap);
    this.events();
    editor.world.changed.add(this.update);
    this.update();
  }
  enable(copy: boolean): void {
    if (
      this.editor.interactions.current ||
      this.editor.blocked ||
      !selectedBodies(this.editor, copy ? "duplicate" : "move").length
    )
      return;
    this.editor.modeling.setTool("move");
    this.pivotMode = false;
    if (copy) this.open(true);
    this.editor.refresh();
  }
  private open(duplicate: boolean): Session | null {
    const bodies = selectedBodies(this.editor, duplicate ? "duplicate" : "move");
    if (!bodies.length) return null;
    const lease = this.editor.interactions.acquire("body-move", () => this.cancel());
    if (!lease) return null;
    this.gizmo.input.removeAttribute("aria-label");
    this.session = {
      bodies,
      lease,
      explicitCopy: duplicate,
      valid: true,
      value: 0,
      axis: "X",
      rotate: false,
      pivotOnly: this.pivotMode,
      edit: {
        ids: bodies.map((b) => b.id),
        pivot: [...this.pivot],
        axis: axes.X,
        translation: [0, 0, 0],
        angle: 0,
        duplicate,
      },
    };
    this.preview(0);
    return this.session;
  }
  private start = (event: PointerEvent, axis: string, rotate: boolean): void => {
    if (
      event.button ||
      this.editor.blocked ||
      this.pointer ||
      (this.session && !this.session.edit.duplicate)
    )
      return;
    const s = this.session ?? this.open(false);
    if (!s) return;
    s.edit.duplicate = !s.pivotOnly && (s.explicitCopy || event.altKey);
    s.axis = axis;
    s.rotate = rotate;
    s.edit.axis = axes[axis];
    this.pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      frame: dragFrame(this.editor, this.pivot, axis, event.clientX, event.clientY),
    };
    this.gizmo.input.setAttribute(
      "aria-label",
      `${s.pivotOnly ? "Pivot" : rotate ? "Body rotation" : "Body translation"} ${axis}`,
    );
    s.lease.capture(event.currentTarget as Element, event.pointerId);
    event.preventDefault();
    this.editor.refresh();
  };
  private preview(value: number): void {
    const s = this.session;
    if (s?.lease.phase !== "editing") return;
    s.valid = Number.isFinite(value);
    s.value = value;
    if (s.valid) {
      s.edit.translation = s.rotate ? [0, 0, 0] : (axes[s.axis].map((v) => v * value) as Vector);
      s.edit.angle = s.rotate ? value : 0;
      if (!s.pivotOnly) {
        const retained =
          this.editor.store.data.bodies?.filter(
            (b) => s.edit.duplicate || !s.edit.ids.includes(b.id),
          ) ?? [];
        s.lease.show({
          ...this.editor.store.data,
          bodies: [...retained, ...placedBodies(s.bodies, s.edit)],
        });
      }
    }
    if (!numericFocus(this.gizmo.input)) this.gizmo.input.value = String(Number(value.toFixed(4)));
    this.editor.refresh();
  }
  private async commit(): Promise<void> {
    const s = this.session;
    if (!s?.valid || !s.lease.close()) return;
    s.lease.releaseCapture();
    this.pointer = null;
    if (s.pivotOnly) {
      this.customPivot = true;
      this.pivot = s.edit.pivot.map((v, i) => v + s.edit.translation[i]) as Vector;
    } else if (s.value !== 0 || s.edit.duplicate) {
      const before = new Set(this.editor.store.data.bodies?.map((b) => b.id));
      const ok = await this.editor.store.request({ kind: "transform-bodies", transform: s.edit });
      if (ok) {
        const ids = s.edit.duplicate
          ? (this.editor.store.data.bodies?.filter((b) => !before.has(b.id)).map((b) => b.id) ?? [])
          : s.edit.ids;
        this.editor.modeling.targets = ids.map((body) => ({ kind: "body", body }));
        this.selection = ids.slice().sort().join(",");
        this.pivot = s.edit.pivot.map((v, i) => v + s.edit.translation[i]) as Vector;
      }
    }
    this.session = null;
    s.lease.release();
    this.snap.hidden = true;
    this.editor.refresh();
  }
  private cancel(): void {
    const s = this.session;
    if (s && !s.lease.close()) return;
    this.session = null;
    this.pointer = null;
    s?.lease.release();
    this.snap.hidden = true;
    this.editor.refresh();
  }
  private movePointer = (event: PointerEvent): void => {
    const p = this.pointer,
      s = this.session;
    if (!p || !s || p.id !== event.pointerId) return;
    s.edit.duplicate = !s.pivotOnly && (s.explicitCopy || event.altKey);
    p.moved ||= Math.hypot(event.clientX - p.x, event.clientY - p.y) > 3;
    if (!p.moved) return;
    let value = s.rotate
      ? snapRotation(p.frame.angle(event.clientX, event.clientY), event.shiftKey, event.altKey)
      : p.frame.translation(event.clientX, event.clientY);
    if (!s.rotate && this.editor.gridSnap)
      value = Math.round(value / this.editor.world.spacing) * this.editor.world.spacing;
    const snap =
      !s.rotate && !event.shiftKey
        ? bodySnap(this.editor, s.pivotOnly ? [] : s.edit.ids, s.edit.pivot, s.axis, value)
        : null;
    this.snap.hidden = !snap;
    if (snap) {
      value = snap.value;
      const p = this.editor.world.project(snap.point);
      this.snap.style.left = `${p.x}px`;
      this.snap.style.top = `${p.y}px`;
    }
    this.preview(value);
  };
  private events(): void {
    const options = { signal: this.abort.signal };
    window.addEventListener("pointermove", this.movePointer, options);
    replayPointerModifiers(this.abort.signal, () => !!this.pointer, this.movePointer);
    window.addEventListener(
      "pointerup",
      (event) => {
        const p = this.pointer;
        if (!p || p.id !== event.pointerId) return;
        this.movePointer(event);
        this.pointer = null;
        this.session?.lease.releaseCapture();
        if (p.moved) void this.commit();
        else {
          this.gizmo.input.focus();
          this.gizmo.input.select();
        }
      },
      options,
    );
    this.gizmo.input.addEventListener(
      "input",
      () => this.preview(this.gizmo.input.value.trim() ? Number(this.gizmo.input.value) : NaN),
      options,
    );
    onModelKeydown(
      (event) => {
        if (this.editor.world.active) return;
        if (this.session && (event.key === "Escape" || event.key === "Enter")) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (event.key === "Escape") this.cancel();
          else void this.commit();
        }
      },
      { ...options, capture: true },
    );
    window.addEventListener("pointercancel", () => this.cancel(), options);
  }
  private update = (): void => {
    const bodies = selectedBodies(this.editor),
      key = bodies
        .map((b) => b.id)
        .sort()
        .join(",");
    if (!this.session && key !== this.selection) {
      this.selection = key;
      this.pivotMode = false;
      this.customPivot = false;
    }
    if (!this.session && !this.customPivot && bodies.length) this.pivot = bodyCenter(bodies);
    this.gizmo.root.hidden =
      !!this.editor.world.active ||
      this.editor.modeling.tool !== "move" ||
      (!bodies.length && !this.session) ||
      (!!this.editor.interactions.current && this.editor.interactions.current.kind !== "body-move");
    this.gizmo.input.hidden = !this.session || !this.gizmo.input.hasAttribute("aria-label");
    this.gizmo.input.setAttribute("aria-invalid", String(this.session?.valid === false));
    const session = this.session;
    const pivot =
      session && !session.rotate && session.valid
        ? (session.edit.pivot.map((v, i) => v + session.edit.translation[i]) as Vector)
        : this.pivot;
    this.gizmo.update(this.editor, pivot, this.pivotMode);
  };
  dispose(): void {
    this.cancel();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.pivotDrag.dispose();
    this.gizmo.dispose();
    this.snap.remove();
  }
}
