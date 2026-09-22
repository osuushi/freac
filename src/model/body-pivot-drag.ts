import * as THREE from "three";
import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { alignedAxis, uprightAxis } from "../sketch/move-widget/geometry.js";
import type { Vector } from "../sketch/planes.js";
import { anchorSnap } from "./anchor-snapping.js";

/** The anchor is UI state. Dragging it never edits body geometry or Undo. */
export class BodyPivotDrag {
  private abort = new AbortController();
  private drag: {
    id: number;
    x: number;
    y: number;
    origin: Vector;
    hit: THREE.Vector3;
    plane: THREE.Plane;
    lease: InteractionLease;
    moved: boolean;
  } | null = null;
  constructor(
    private editor: SketchEditor,
    private button: HTMLButtonElement,
    get: () => Vector,
    private set: (point: Vector) => void,
    toggle: () => void,
  ) {
    const options = { signal: this.abort.signal };
    button.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button || editor.blocked || editor.interactions.current) return;
        event.preventDefault();
        event.stopPropagation();
        const origin = [...get()] as Vector;
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
          this.normal(),
          new THREE.Vector3(...origin),
        );
        const hit = this.point(event, plane);
        if (!hit) return;
        const lease = editor.interactions.acquire("body-move", () => this.finish(true));
        if (!lease) return;
        this.drag = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          origin,
          hit,
          plane,
          lease,
          moved: false,
        };
        lease.capture(button, event.pointerId);
      },
      options,
    );
    window.addEventListener("pointermove", this.move, options);
    window.addEventListener(
      "pointerup",
      (event) => {
        if (event.pointerId !== this.drag?.id) return;
        this.move(event);
        const moved = this.drag.moved;
        this.finish(false);
        if (!moved) toggle();
      },
      options,
    );
    button.addEventListener(
      "click",
      (event) => {
        event.stopPropagation();
        if (event.detail === 0 && !editor.interactions.current) toggle();
      },
      options,
    );
    onModelKeydown(
      (event) => {
        if (this.drag && event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.finish(true);
        }
      },
      { ...options, capture: true },
    );
    window.addEventListener("blur", () => this.finish(true), options);
    window.addEventListener("pointercancel", () => this.finish(true), options);
  }
  private normal(): THREE.Vector3 {
    const world = this.editor.world,
      frame = world.activeFrame;
    if (frame) return new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v));
    const aligned = alignedAxis(world.camera);
    if (aligned !== null) return new THREE.Vector3().setComponent(aligned, 1);
    return new THREE.Vector3(...uprightAxis(world.camera));
  }
  private point(event: PointerEvent, plane: THREE.Plane): THREE.Vector3 | null {
    const bounds = this.editor.world.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - bounds.x) / bounds.width) * 2 - 1,
        1 - ((event.clientY - bounds.y) / bounds.height) * 2,
      ),
      this.editor.world.camera,
    );
    return ray.ray.intersectPlane(plane, new THREE.Vector3());
  }
  private move = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3;
    if (!drag.moved) return;
    const snap = event.metaKey
      ? null
      : anchorSnap(this.editor, { x: event.clientX, y: event.clientY });
    this.button.dataset.snapped = String(!!snap);
    if (snap) {
      this.set(snap);
      return;
    }
    const hit = this.point(event, drag.plane);
    if (!hit) return;
    const delta = hit.sub(drag.hit);
    this.set(new THREE.Vector3(...drag.origin).add(delta).toArray() as Vector);
  };
  private finish(cancel: boolean): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    delete this.button.dataset.snapped;
    if (cancel) this.set(drag.origin);
    drag.lease.release();
    this.editor.refresh();
  }
  dispose(): void {
    this.finish(true);
    this.abort.abort();
  }
}
