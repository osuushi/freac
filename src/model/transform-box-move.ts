import type * as THREE from "three";
import type { InteractionLease } from "../sketch/active-interaction.js";
import { withSketch } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { PlaneFrame, Vector } from "../sketch/planes.js";
import { transformSelected } from "../sketch/selection-transform.js";
import { placedBodies } from "./body-placement.js";
import type { ScaleSource } from "./scale.js";
import { scaleSelection } from "./scale-selection.js";
import { pointOnTransformPlane, transformPlane } from "./transform-plane.js";

type Drag = {
  id: number;
  origin: Vector;
  start: THREE.Vector3;
  plane: THREE.Plane;
  source: ScaleSource;
  lease: InteractionLease;
  moved: boolean;
  valid: boolean;
  pending: Vector | null;
  running: Promise<void> | null;
  delta: Vector;
};

/** Command-drag the selected box in the same plane used by its sphere anchor. */
export class TransformBoxMove {
  private abort = new AbortController();
  private drag: Drag | null = null;
  constructor(
    private editor: SketchEditor,
    private finishScale: () => Promise<boolean>,
  ) {
    const options = { signal: this.abort.signal };
    editor.world.canvas.addEventListener("pointerdown", this.start, options);
    window.addEventListener("pointermove", this.move, options);
    window.addEventListener("pointerup", this.release, options);
    window.addEventListener("pointercancel", () => void this.cancel(), options);
    window.addEventListener("blur", () => void this.cancel(), options);
    onModelKeydown(
      (event) => {
        if (this.drag && event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          void this.cancel();
        }
      },
      { ...options, capture: true },
    );
  }
  private start = async (event: PointerEvent): Promise<void> => {
    const editor = this.editor;
    if (
      event.button ||
      !event.metaKey ||
      this.drag ||
      !editor.world.transformBoxContains?.(event.clientX, event.clientY)
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    let released = false;
    let last = { x: event.clientX, y: event.clientY };
    if (editor.interactions.current?.kind === "scale") {
      const buffer = new AbortController();
      const track = (next: PointerEvent) => {
        if (next.pointerId !== event.pointerId) return;
        last = { x: next.clientX, y: next.clientY };
        released ||= next.type === "pointerup";
      };
      window.addEventListener("pointermove", track, { signal: buffer.signal, capture: true });
      window.addEventListener("pointerup", track, { signal: buffer.signal, capture: true });
      let finished: boolean;
      try {
        finished = await this.finishScale();
      } finally {
        buffer.abort();
      }
      if (!finished) return;
    }
    if (editor.blocked || editor.interactions.current) return;
    const source = scaleSelection(editor);
    if (!source) return;
    const origin = editor.transformAnchor?.point ?? [0, 0, 0];
    const plane = transformPlane(editor, origin);
    const hit = pointOnTransformPlane(editor, event.clientX, event.clientY, plane);
    if (!hit) return;
    const lease = editor.interactions.acquire("transform-box-move", () => this.cancel());
    if (!lease) return;
    this.drag = {
      id: event.pointerId,
      origin,
      start: hit,
      plane,
      source,
      lease,
      moved: false,
      valid: false,
      pending: null,
      running: null,
      delta: [0, 0, 0],
    };
    if (!released) lease.capture(editor.world.canvas, event.pointerId);
    if (last.x !== event.clientX || last.y !== event.clientY) {
      this.move(
        new PointerEvent("pointermove", {
          pointerId: event.pointerId,
          clientX: last.x,
          clientY: last.y,
        }),
      );
    }
    if (released) void this.commit(this.drag);
  };
  private move = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId || drag.lease.phase !== "editing") return;
    const hit = pointOnTransformPlane(this.editor, event.clientX, event.clientY, drag.plane);
    if (!hit) return;
    const raw = hit.sub(drag.start);
    const delta = raw.toArray() as Vector;
    drag.moved ||=
      raw.length() > (this.editor.world.height * 3) / this.editor.world.canvas.clientHeight;
    if (!drag.moved) return;
    if (this.editor.gridSnap) {
      const spacing = this.editor.world.spacing;
      for (let i = 0; i < 3; i++) delta[i] = Math.round(delta[i] / spacing) * spacing;
    }
    drag.pending = delta;
    if (!drag.running) drag.running = this.drain(drag);
  };
  private async drain(drag: Drag): Promise<void> {
    while (drag.pending && drag.lease.phase === "editing") {
      const delta = drag.pending;
      drag.pending = null;
      drag.valid = false;
      const candidate = await this.preview(drag, delta);
      if (drag.lease.phase === "editing" && !drag.pending) {
        drag.valid = candidate;
        if (candidate) drag.delta = delta;
      }
      this.editor.refresh();
    }
    drag.running = null;
  }
  private async preview(drag: Drag, delta: Vector): Promise<boolean> {
    const editor = this.editor,
      document = editor.store.data,
      source = drag.source;
    if (source.kind === "curves") {
      const sketch = document.sketches.find((s) => s.id === source.sketchId);
      if (!sketch) return false;
      const moved = transformSelected(editor, sketch, (p) => ({
        x: p.x + delta.reduce((sum, v, i) => sum + v * sketch.plane.u[i], 0),
        y: p.y + delta.reduce((sum, v, i) => sum + v * sketch.plane.v[i], 0),
      }));
      const valid = await editor.store.request({ kind: "preview", sketch: moved });
      if (valid) drag.lease.show(editor.store.candidate);
      return valid;
    }
    if (source.kind === "sketches") {
      let next = document;
      for (const id of source.ids) {
        const sketch = document.sketches.find((s) => s.id === id);
        if (!sketch) return false;
        next = withSketch(next, {
          ...sketch,
          plane: {
            ...sketch.plane,
            origin: sketch.plane.origin.map((v, i) => v + delta[i]) as Vector,
          },
        });
      }
      drag.lease.show(next);
      return true;
    }
    if (!source.faces.length && !source.edges.length) {
      const bodies = document.bodies ?? [];
      const selected = bodies.filter((b) => source.ids.includes(b.id));
      if (!selected.length) return false;
      const moved = placedBodies(selected, {
        ids: source.ids,
        pivot: drag.origin,
        translation: delta,
        axis: [0, 0, 1],
        angle: 0,
        duplicate: false,
      });
      drag.lease.show({
        ...document,
        bodies: [...bodies.filter((b) => !source.ids.includes(b.id)), ...moved],
      });
      return true;
    }
    const request = source.faces.length
      ? {
          kind: "move-faces" as const,
          operation: {
            faces: source.faces,
            bodyIds: source.ids,
            pivot: drag.origin,
            axis: [0, 0, 1] as Vector,
            angle: 0,
            translation: delta,
          },
        }
      : {
          kind: "move-edges" as const,
          operation: { edges: source.edges, bodyIds: source.ids, translation: delta },
        };
    const valid = await editor.store.request(request);
    if (valid) drag.lease.show(editor.store.candidate);
    return valid;
  }
  private release = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;
    this.move(event);
    void this.commit(drag);
  };
  private async commit(drag: Drag): Promise<void> {
    drag.lease.releaseCapture();
    await drag.running;
    if (!drag.moved || !drag.valid || drag.delta.every((value) => value === 0)) {
      await this.cancel();
      return;
    }
    const source = drag.source,
      delta = drag.delta;
    const frames: { sketchId: string; frame: PlaneFrame }[] = [];
    if (source.kind === "sketches") {
      for (const id of source.ids) {
        const sketch = this.editor.store.data.sketches.find((s) => s.id === id);
        if (!sketch) {
          await this.cancel();
          return;
        }
        frames.push({
          sketchId: id,
          frame: {
            ...sketch.plane,
            origin: sketch.plane.origin.map((v, i) => v + delta[i]) as Vector,
          },
        });
      }
    }
    if (!drag.lease.close()) {
      await this.cancel();
      return;
    }
    if (source.kind === "sketches") {
      await this.editor.store.request({
        kind: "place-sketch",
        ...frames[0],
        additional: frames.slice(1),
      });
    } else if (source.kind === "solids" && !source.faces.length && !source.edges.length) {
      await this.editor.store.request({
        kind: "transform-bodies",
        transform: {
          ids: source.ids,
          pivot: drag.origin,
          axis: [0, 0, 1],
          angle: 0,
          translation: delta,
          duplicate: false,
        },
      });
    } else await this.editor.accept();
    this.drag = null;
    drag.lease.release();
    this.editor.refresh();
  }
  private async cancel(): Promise<void> {
    const drag = this.drag;
    if (!drag?.lease.close()) return;
    this.drag = null;
    drag.pending = null;
    drag.lease.show(null);
    if (
      drag.source.kind === "curves" ||
      (drag.source.kind === "solids" && (drag.source.faces.length || drag.source.edges.length))
    )
      await this.editor.store.cancelPreview();
    await drag.running;
    drag.lease.release();
    this.editor.refresh();
  }
  dispose(): void {
    void this.cancel();
    this.abort.abort();
  }
}
