import { directionalOffset, directionalWidget } from "../model/directional-widget.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { numericFocus } from "../tools/menu-focus.js";
import type { InteractionLease } from "./active-interaction.js";
import { type Constraint, type Curve, newId, type Sketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { distance } from "./geometry.js";
import { GestureSolve } from "./gesture-solve.js";
import { hasClosedEndpoints } from "./loop-boundary.js";
import { onModelKeydown } from "./model-keys.js";
import { offsetDistance, offsetFrame } from "./offset-geometry.js";
import { type OffsetTarget, offsetLinks, offsetResult, prepareOffset } from "./offset-target.js";
import type { Point, Vector } from "./planes.js";
import type { SelectionTarget } from "./selected-targets.js";

type Session = {
  sketch: Sketch;
  target: OffsetTarget;
  ids: string[];
  links: Constraint[];
  selection: readonly SelectionTarget[];
  solve: GestureSolve;
  start: Point;
  screen: Point;
  pointer: number;
  moved: boolean;
  valid: boolean;
  amount: number;
};
export class OffsetControls {
  private disposeTool: () => void;
  private root = document.createElement("div");
  private handle = document.createElement("button");
  private input = document.createElement("input");
  private abort = new AbortController();
  private session: Session | null = null;
  private interaction: InteractionLease | null = null;
  private get closing(): boolean {
    return !!this.interaction && this.interaction.phase !== "editing";
  }
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.disposeTool = toolCatalog(editor).register({
      id: "sketch-offset",
      label: "Offset sketch curves",
      category: "Sketch",
      aliases: ["offset sketch", "parallel curve"],
      reason: () =>
        idleReason(editor) ?? (this.selected() ? null : "Select a sketch edge or closed loop"),
      run: () => {
        const rect = this.handle.getBoundingClientRect();
        this.begin({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
        if (this.session) {
          this.input.focus();
          this.input.select();
        }
      },
    });
    this.root.className = "offset-control";
    this.handle.type = "button";
    this.handle.className = "sketch-offset-handle orientable-handle";
    this.handle.setAttribute("aria-label", "Offset edge");
    this.handle.dataset.action = "offset";
    this.input.type = "text";
    this.input.inputMode = "decimal";
    this.input.setAttribute("aria-label", "Offset distance");
    this.root.append(this.handle, this.input);
    overlay.append(this.root);
    const options = { signal: this.abort.signal };
    this.handle.addEventListener("pointerdown", this.start, options);
    this.handle.addEventListener("pointermove", this.move, options);
    this.handle.addEventListener("pointerup", this.release, options);
    this.handle.addEventListener("pointercancel", () => void this.cancel(), options);
    this.input.addEventListener("input", () => this.preview(Number(this.input.value)), options);
    onModelKeydown(
      (event) => {
        if (!this.session) return;
        event.stopImmediatePropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          void this.cancel();
        }
        if (event.key === "Enter") {
          event.preventDefault();
          void this.commit();
        }
      },
      { ...options, capture: true },
    );
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.session || this.root.contains(event.target as Node)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void this.cancel();
      },
      { ...options, capture: true },
    );
    editor.world.changed.add(this.update);
    this.update();
  }
  private selected(): Curve[] | undefined {
    const e = this.editor;
    if (
      !e.selectionOwners.size ||
      (e.rectangleContext && e.selectionOwners.size !== e.rectangleContext.members.length) ||
      e.selectedPoint ||
      e.pointMenu ||
      e.pointChoice?.size
    )
      return undefined;
    const curves = e.sketch?.curves.filter((c) => e.selectionOwners.has(c.id));
    return curves &&
      !curves.some((c) => c.kind === "bezier") &&
      (curves.length === 1 || hasClosedEndpoints(curves))
      ? curves
      : undefined;
  }
  private start = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    this.begin({ x: event.clientX, y: event.clientY }, event.pointerId);
  };
  private begin(point: Point, pointer?: number): void {
    const curves = this.selected(),
      sketch = this.editor.sketch;
    if (this.session || this.editor.blocked || this.editor.isDragging || !curves || !sketch) return;
    let target: OffsetTarget;
    try {
      target = prepareOffset(curves);
    } catch (error) {
      this.editor.message = error instanceof Error ? error.message : String(error);
      this.editor.refresh();
      return;
    }
    const start = this.editor.world.pointAt(sketch.plane, point.x, point.y);
    if (!start) return;
    const ids = curves.map(() => newId());
    const interaction = this.editor.interactions.acquire("offset", () => this.cancel());
    if (!interaction) return;
    this.interaction = interaction;
    this.session = {
      sketch,
      target,
      ids,
      links: offsetLinks(sketch, target, ids),
      selection: this.editor.selected.targets,
      solve: new GestureSolve(this.editor, interaction),
      start,
      screen: { x: point.x, y: point.y },
      pointer: pointer ?? -1,
      moved: false,
      valid: false,
      amount: this.editor.world.spacing,
    };
    this.editor.select([]);
    if (pointer !== undefined) interaction.capture(this.handle, pointer);
    this.preview(this.session.amount);
  }
  private preview(amount: number): void {
    const s = this.session;
    if (!s || this.closing) return;
    s.amount = amount;
    try {
      const curves = offsetResult(s.target, amount, s.ids);
      s.valid = true;
      s.solve.update({
        ...s.sketch,
        curves: [...s.sketch.curves, ...curves],
        constraints: [...s.sketch.constraints, ...s.links],
      });
      this.editor.message = "";
      this.input.removeAttribute("aria-invalid");
    } catch (error) {
      s.valid = false;
      s.solve.invalidate();
      this.input.setAttribute("aria-invalid", "true");
      this.editor.message = error instanceof Error ? error.message : String(error);
    }
    if (!numericFocus(this.input)) this.input.value = String(Number(amount.toFixed(4)));
    this.editor.refresh();
  }
  private move = (event: PointerEvent): void => {
    const s = this.session;
    if (!s || s.pointer !== event.pointerId || !this.handle.hasPointerCapture(event.pointerId))
      return;
    s.moved ||= distance(s.screen, { x: event.clientX, y: event.clientY }) > 3;
    const point = this.editor.world.pointAt(s.sketch.plane, event.clientX, event.clientY);
    if (s.moved && point)
      this.preview(
        offsetDistance(
          s.target.curve,
          s.start,
          point,
          this.editor.gridSnap ? this.editor.world.spacing : 0,
        ) * s.target.direction,
      );
  };
  private release = (event: PointerEvent): void => {
    const s = this.session;
    if (!s || s.pointer !== event.pointerId) return;
    this.move(event);
    this.interaction?.releaseCapture();
    if (s.moved) void this.commit();
    else {
      this.input.focus();
      this.input.select();
    }
  };
  private async commit(): Promise<void> {
    const s = this.session,
      interaction = this.interaction;
    if (!s || !interaction?.wait()) return;
    const valid = await s.solve.flush();
    if (this.session !== s || interaction.phase !== "waiting") return;
    if (!s.valid || !valid) {
      interaction.resume();
      this.editor.refresh();
      return;
    }
    if (!interaction.close()) return;
    if (await this.editor.accept()) this.editor.select(s.ids);
    else this.editor.selectTargets(s.selection);
    this.finish();
  }
  private async cancel(): Promise<void> {
    const s = this.session;
    if (!s || !this.interaction?.close()) return;
    await s.solve.cancel();
    this.editor.selectTargets(s.selection);
    this.finish();
  }
  private finish(): void {
    const interaction = this.interaction;
    this.session = null;
    this.interaction = null;
    interaction?.release();
  }
  private update = (): void => {
    const s = this.session,
      curves = this.selected(),
      sketch = s?.sketch ?? this.editor.sketch;
    this.root.hidden = (!s && (!curves || this.editor.moveMode)) || !sketch;
    if (!sketch || (!s && !curves)) return;
    let target = s?.target;
    if (!target && curves) {
      try {
        target = prepareOffset(curves);
      } catch {
        target = { curve: curves[0], direction: 1 };
      }
    }
    if (!target) return;
    const loop = !!s?.target.loop || (curves?.length ?? 0) > 1;
    this.handle.title = `${loop ? "Offset loop" : "Offset edge"} · drag outward or click to type`;
    this.handle.setAttribute("aria-label", loop ? "Offset loop" : "Offset edge");
    const base = offsetFrame(target.curve);
    const frame = {
        point: base.point,
        normal: { x: base.normal.x * target.direction, y: base.normal.y * target.direction },
      },
      p = this.editor.world.projectLocal(sketch.plane, frame.point);
    const normal = sketch.plane.u.map(
      (v, i) => v * frame.normal.x + sketch.plane.v[i] * frame.normal.y,
    ) as Vector;
    const width = sketch.plane.u.map(
      (v, i) => -v * frame.normal.y + sketch.plane.v[i] * frame.normal.x,
    ) as Vector;
    const offset = directionalOffset(this.editor.world.camera, normal, 48, width);
    this.handle.innerHTML = directionalWidget(this.editor.world.camera, normal, "offset", width);
    this.handle.dataset.geometryInvalid = String(!!s && !s.valid);
    const bounds = this.editor.world.canvas.getBoundingClientRect();
    this.root.style.left = `${p.x - bounds.left + offset.x}px`;
    this.root.style.top = `${p.y - bounds.top + offset.y}px`;
    this.input.hidden = !s;
    this.handle.disabled = this.closing || (!s && this.editor.blocked);
  };
  dispose(): void {
    void this.cancel();
    this.disposeTool();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.root.remove();
  }
}
