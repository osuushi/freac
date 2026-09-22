import type { InteractionLease } from "./active-interaction.js";
import { curveBounds } from "./curve-geometry.js";
import { validateSketch } from "./document.js";
import { dragIntent } from "./drag-intent.js";
import { beginDrag, type Drag, resolveDrag } from "./drag-state.js";
import { updateDrag } from "./drag-update.js";
import type { SketchEditor } from "./editor.js";
import { connectedSelection, distance } from "./geometry.js";
import { GestureSolve } from "./gesture-solve.js";
import { hitIds, pick, pointKey } from "./picking.js";
import { choosePoints, chosenPoints, openPointMenu, selectedPointHits } from "./point-selection.js";
import { pointTarget } from "./selected-targets.js";
import { selectHit } from "./selection-input.js";
import { snapped } from "./snapping.js";
import { axisQuantity } from "./transform-handles.js";

export class PointerGestures {
  private drag: Drag | null = null;
  private solve: GestureSolve | null = null;
  private interaction: InteractionLease | null = null;
  private get releasing(): boolean {
    return !!this.interaction && this.interaction.phase !== "editing";
  }
  private failure = "";
  private readonly abort = new AbortController();
  private get canvas() {
    return this.editor.world.canvas;
  }
  constructor(private readonly editor: SketchEditor) {
    const options = { signal: this.abort.signal };
    editor.editDuringDrag = (quantity, value) => {
      if (!this.drag) return;
      const previous = this.drag.quantities[quantity];
      this.drag.quantities[quantity] = value;
      try {
        const candidate = updateDrag(editor, this.drag, this.drag.lastPoint, this.drag.bypass);
        validateSketch(candidate, false);
        this.submit(candidate);
        this.drag.valid = true;
      } catch (error) {
        if (previous === undefined) delete this.drag.quantities[quantity];
        else this.drag.quantities[quantity] = previous;
        throw error;
      }
      editor.refresh();
    };
    this.canvas.addEventListener("pointerdown", this.start, options);
    this.canvas.addEventListener("pointermove", this.move, options);
    this.canvas.addEventListener("pointerup", this.release, options);
    this.canvas.addEventListener("pointercancel", this.cancelAndDraw, options);
    window.addEventListener("keydown", this.modifiers, options);
    window.addEventListener("keyup", this.modifiers, options);
    this.canvas.addEventListener(
      "dblclick",
      (event) => {
        if (editor.tool === "trim" || event.shiftKey || event.metaKey || event.ctrlKey) return;
        const hit = pick(editor, { x: event.clientX, y: event.clientY }),
          sketch = editor.sketch;
        if (!editor.blocked && !editor.isDragging && hit && sketch && !pointKey(hit)) {
          editor.select(connectedSelection(sketch, new Set(hitIds(hit))));
          editor.overlaps = null;
          editor.refresh();
        }
      },
      options,
    );
  }
  private finish(): void {
    const interaction = this.interaction;
    this.drag = null;
    this.solve = null;
    this.interaction = null;
    this.editor.snap = null;
    this.editor.selectionBox = null;
    interaction?.release();
  }
  private cancel = async (): Promise<void> => {
    if (!this.drag || !this.interaction?.close()) return;
    this.editor.selectTargets(this.drag.beforeTargets);
    if (this.solve) await this.solve.cancel();
    this.finish();
  };
  private cancelAndDraw = (): void => {
    void this.cancel();
  };
  private start = async (event: PointerEvent): Promise<void> => {
    if (
      event.button !== 0 ||
      this.drag ||
      this.editor.isDragging ||
      this.editor.tool === "trim" ||
      this.editor.world.cameraTransitioning ||
      this.editor.blocked ||
      !this.editor.world.active
    )
      return;
    event.preventDefault();
    this.failure = "";
    this.canvas.focus();
    await this.editor.commitNumeric();
    this.drag = beginDrag(this.editor, event);
    if (this.drag) {
      const interaction = this.editor.interactions.acquire("pointer", this.cancel);
      if (!interaction) {
        this.drag = null;
        return;
      }
      this.interaction = interaction;
      interaction.capture(this.canvas, event.pointerId);
      this.move(event);
    }
    this.editor.refresh();
  };
  private submit(candidate: import("./document.js").Sketch): void {
    this.failure = "";
    if (!this.interaction) return;
    this.solve ??= new GestureSolve(this.editor, this.interaction);
    this.solve.update(candidate, this.drag ? dragIntent(this.drag, candidate) : { kind: "direct" });
  }
  private hover(event: PointerEvent): void {
    const editor = this.editor;
    if (editor.tool === "trim") return;
    editor.pointer = { x: event.clientX, y: event.clientY };
    if (!editor.world.activeFrame) return;
    editor.hover = pick(editor, editor.pointer);
    const point = editor.world.pointAt(editor.world.activeFrame, event.clientX, event.clientY);
    if (point && editor.tool !== "select") snapped(editor, point, new Set(), event.shiftKey);
    else editor.snap = null;
    this.canvas.style.cursor =
      editor.placingPivot || editor.creationArmed
        ? "crosshair"
        : editor.hover?.kind === "rotate"
          ? "grab"
          : editor.hover &&
              (editor.tool === "select" ||
                !pointKey(editor.hover) ||
                pointKey(editor.hover) === editor.selectedPoint)
            ? "move"
            : editor.tool === "select"
              ? "default"
              : "crosshair";
    if (event.shiftKey && editor.hover && pointKey(editor.hover))
      openPointMenu(editor, editor.hover, editor.pointer, true);
    editor.refresh();
  }
  private move = (event: PointerEvent): void => {
    if (this.releasing) return;
    const drag = this.drag,
      editor = this.editor;
    if (!drag) {
      if (editor.blocked) return;
      this.hover(event);
      return;
    }
    if (drag.id !== event.pointerId) return;
    const point = editor.world.pointAt(drag.sketch.plane, event.clientX, event.clientY);
    if (!point) return;
    drag.lastPoint = point;
    drag.bypass = event.shiftKey;
    drag.symmetric = event.altKey;
    editor.pointer = { x: event.clientX, y: event.clientY };
    drag.moved ||= distance(drag.screen, { x: event.clientX, y: event.clientY }) > drag.threshold;
    if (!drag.moved) return;
    editor.hover = null;
    resolveDrag(editor, drag, event);
    if (drag.mode === "pending") return;
    if (drag.mode === "box")
      editor.selectionBox = { a: drag.screen, b: { x: event.clientX, y: event.clientY } };
    else {
      try {
        const candidate = updateDrag(editor, drag, point, event.shiftKey);
        validateSketch(candidate, false);
        this.submit(candidate);
        drag.valid = true;
        editor.message = "";
      } catch (error) {
        this.solve?.invalidate();
        drag.valid = false;
        this.failure = editor.message = String(error);
      }
    }
    editor.refresh();
  };
  private modifiers = (event: KeyboardEvent): void => {
    if (!["Alt", "Shift"].includes(event.key) || !this.editor.pointer) return;
    const pointer = this.editor.pointer;
    this.move(
      new PointerEvent("pointermove", {
        pointerId: this.drag?.id ?? 0,
        clientX: pointer.x,
        clientY: pointer.y,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
      }),
    );
  };
  private selectBox(drag: Drag): void {
    const box = this.editor.selectionBox;
    if (!box) return;
    const selected = drag.additive ? new Set(drag.beforeSelection) : new Set<string>();
    for (const curve of drag.sketch.curves) {
      const points = curveBounds(curve).map((p) =>
        this.editor.world.projectLocal(drag.sketch.plane, p),
      );
      if (
        points.every(
          (p) =>
            p.x >= Math.min(box.a.x, box.b.x) &&
            p.x <= Math.max(box.a.x, box.b.x) &&
            p.y >= Math.min(box.a.y, box.b.y) &&
            p.y <= Math.max(box.a.y, box.b.y),
        )
      )
        if (drag.toggle && selected.has(curve.id)) selected.delete(curve.id);
        else selected.add(curve.id);
    }
    if (drag.additive) choosePoints(this.editor, selectedPointHits(this.editor), selected);
    else this.editor.select(selected);
  }
  private release = async (event: PointerEvent): Promise<void> => {
    const drag = this.drag,
      editor = this.editor;
    const interaction = this.interaction;
    if (!drag || drag.id !== event.pointerId || !interaction || this.releasing) return;
    this.move(event);
    interaction.wait();
    interaction.releaseCapture();
    await editor.commitNumeric();
    const solved = this.solve ? await this.solve.flush() : true;
    if (this.drag !== drag || !interaction.close()) return;
    if (!drag.moved && drag.hits[0]) {
      const additive = event.shiftKey || event.metaKey || event.ctrlKey;
      selectHit(editor, drag.hits[0], event);
      if (!additive && drag.hits[0].kind === "curve" && drag.hits[0].group)
        editor.select([drag.hits[0].curve]);
      editor.creationArmed = false;
      editor.message = "";
      if (pointKey(drag.hits[0])) {
        if (!additive) {
          const points = chosenPoints(editor, drag.hits[0]);
          editor.selected.replacePoints(
            points.flatMap((hit) => {
              const target = pointTarget(hit);
              return target ? [target] : [];
            }),
          );
        }
        openPointMenu(editor, drag.hits[0], drag.screen);
      } else if (drag.hits.length > 1) editor.overlaps = { hits: drag.hits, screen: drag.screen };
    } else if (!drag.moved && drag.mode === "pending") {
      if (!drag.additive) editor.select([]);
      editor.message = "";
    } else if (drag.mode === "box") this.selectBox(drag);
    else if (drag.moved && drag.valid && solved && editor.candidate) {
      if (await editor.accept()) {
        editor.creationArmed = false;
        if (drag.copying) editor.select([...drag.ids].map((id) => drag.copyIds?.get(id) ?? id));
        if (drag.symmetric && drag.group) editor.activeHandle = undefined;
        if (drag.mode === "rotate") editor.selectionAngle = drag.pose + drag.angle;
      } else {
        editor.selectTargets(drag.beforeTargets);
      }
    } else if (drag.moved && (!drag.valid || !solved)) {
      editor.selectTargets(drag.beforeTargets);
    } else if (
      drag.mode === "createRectangle" ||
      drag.mode === "createLine" ||
      drag.mode === "createBezier" ||
      drag.mode === "createCircle"
    ) {
      if (!drag.additive) editor.select([]);
      editor.message = "";
    } else if (drag.hits.length > 1) editor.overlaps = { hits: drag.hits, screen: drag.screen };
    const failure = this.failure || (!solved ? editor.message : "");
    if (this.solve && (!drag.valid || !solved))
      await this.editor.store.request({ kind: "discard" });
    if (failure) editor.message = failure;
    this.failure = "";
    this.finish();
    editor.hover = null;
    editor.refresh();
    if (!drag.moved && drag.hits[0]?.kind === "bow") editor.focusQuantity("radius");
    if (!drag.moved && drag.hits[0]?.kind === "translate")
      editor.focusQuantity(axisQuantity(drag.hits[0].axis), drag.symmetric);
    if (!drag.moved && drag.hits[0]?.kind === "rotate")
      editor.focusQuantity("angle", drag.symmetric);
  };
  dispose(): void {
    this.cancelAndDraw();
    this.abort.abort();
  }
}
