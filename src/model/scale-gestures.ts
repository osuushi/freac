import * as THREE from "three";
import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { anchorSnap } from "./anchor-snapping.js";
import { type ScaleWidget, scalePlaneNormal } from "./scale-widget.js";

interface State {
  pivot: Vector;
  factor: number;
  lease: InteractionLease;
}
type Drag = State & {
  id: number;
  x: number;
  y: number;
  pivotDrag: boolean;
  plane: THREE.Plane;
  hit: THREE.Vector3;
  direction: { x: number; y: number };
};
export class ScaleGestures {
  private abort = new AbortController();
  private drag: Drag | null = null;
  constructor(
    private editor: SketchEditor,
    private widget: ScaleWidget,
    private state: () => State | null,
    private change: (pivot: Vector, factor: number) => void,
  ) {
    const options = { signal: this.abort.signal };
    widget.anchor.addEventListener("pointerdown", (e) => this.start(e, true), options);
    widget.handle.addEventListener("pointerdown", (e) => this.start(e, false), options);
    window.addEventListener("pointermove", this.move, options);
    window.addEventListener(
      "pointerup",
      (event) => {
        if (event.pointerId !== this.drag?.id) return;
        this.move(event);
        this.stop();
      },
      options,
    );
    for (const button of [widget.anchor, widget.handle])
      button.addEventListener("click", (e) => e.stopPropagation(), options);
  }
  private point(event: PointerEvent, plane: THREE.Plane): THREE.Vector3 | null {
    const bounds = this.editor.world.canvas.getBoundingClientRect(),
      ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        (2 * (event.clientX - bounds.x)) / bounds.width - 1,
        1 - (2 * (event.clientY - bounds.y)) / bounds.height,
      ),
      this.editor.world.camera,
    );
    return ray.ray.intersectPlane(plane, new THREE.Vector3());
  }
  private start(event: PointerEvent, pivotDrag: boolean): void {
    const state = this.state();
    if (event.button || !state || state.lease.phase !== "editing" || this.editor.blocked) return;
    event.preventDefault();
    event.stopPropagation();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      scalePlaneNormal(this.editor),
      new THREE.Vector3(...state.pivot),
    );
    const hit = this.point(event, plane);
    if (!hit) return;
    this.drag = {
      ...state,
      pivot: [...state.pivot],
      pivotDrag,
      plane,
      hit,
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      direction: { ...this.widget.direction },
    };
    state.lease.capture(pivotDrag ? this.widget.anchor : this.widget.handle, event.pointerId);
    this.editor.refresh();
  }
  private move = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id || drag.lease.phase !== "editing") return;
    if (!drag.pivotDrag) {
      const distance =
        (event.clientX - drag.x) * drag.direction.x + (event.clientY - drag.y) * drag.direction.y;
      this.change(drag.pivot, drag.factor * 2 ** (distance / 96));
      return;
    }
    const snap = event.metaKey
      ? null
      : anchorSnap(this.editor, { x: event.clientX, y: event.clientY });
    this.widget.anchor.dataset.snapped = String(!!snap);
    const hit = this.point(event, drag.plane);
    if (snap) this.change(snap, drag.factor);
    else if (hit)
      this.change(
        new THREE.Vector3(...drag.pivot).add(hit.sub(drag.hit)).toArray() as Vector,
        drag.factor,
      );
  };
  stop(): void {
    this.drag?.lease.releaseCapture();
    this.drag = null;
    delete this.widget.anchor.dataset.snapped;
    this.editor.refresh();
  }
  dispose(): void {
    this.stop();
    this.abort.abort();
  }
}
