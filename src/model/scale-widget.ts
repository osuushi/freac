import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import { alignedAxis, uprightAxis } from "../sketch/move-widget/geometry.js";
import type { Vector } from "../sketch/planes.js";
import "./scale.css";

export function scalePlaneNormal(editor: SketchEditor): THREE.Vector3 {
  const frame = editor.world.activeFrame;
  if (frame) return new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v));
  const aligned = alignedAxis(editor.world.camera);
  return aligned === null
    ? new THREE.Vector3(...uprightAxis(editor.world.camera))
    : new THREE.Vector3().setComponent(aligned, 1);
}
export class ScaleWidget {
  readonly root = document.createElement("div");
  readonly card = document.createElement("div");
  readonly factor = document.createElement("input");
  readonly anchor = document.createElement("button");
  readonly handle = document.createElement("button");
  readonly accept = document.createElement("button");
  readonly cancel = document.createElement("button");
  direction = { x: 1, y: -1 };
  constructor(overlay: HTMLElement) {
    this.root.className = "scale-widget";
    this.root.hidden = true;
    this.card.className = "scale-card";
    this.anchor.className = "scale-anchor";
    this.anchor.setAttribute("aria-label", "Scale pivot");
    this.anchor.title = "Move scale pivot · Command bypasses snapping";
    this.handle.className = "scale-handle";
    this.handle.setAttribute("aria-label", "Drag scale factor");
    this.handle.title = "Drag outward to grow, inward to shrink";
    this.handle.innerHTML =
      '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M9 27h12v12H9z M24 10h14v14H24z" fill="white" stroke="#151515" stroke-width="1.5"/><path d="M22 26 36 12m-9 0h9v9" fill="none" stroke="#151515" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 26 36 12m-9 0h9v9" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const label = document.createElement("label");
    label.textContent = "Factor ";
    this.factor.type = "text";
    this.factor.inputMode = "decimal";
    this.factor.setAttribute("aria-label", "Scale factor");
    label.append(this.factor, " ×");
    this.accept.textContent = "✓";
    this.accept.setAttribute("aria-label", "Accept scale");
    this.cancel.textContent = "×";
    this.cancel.setAttribute("aria-label", "Cancel scale");
    const actions = document.createElement("div");
    actions.append(this.accept, this.cancel);
    this.card.append(label, actions);
    this.root.append(this.anchor, this.handle, this.card);
    overlay.append(this.root);
  }
  position(editor: SketchEditor, pivot: Vector): void {
    const world = editor.world,
      normal = scalePlaneNormal(editor);
    const frame = world.activeFrame;
    const axis = Math.abs(normal.z) > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const u = frame ? new THREE.Vector3(...frame.u) : axis;
    const v = frame ? new THREE.Vector3(...frame.v) : normal.clone().cross(u);
    const offset = u.add(v).multiplyScalar((64 * world.height) / world.canvas.clientHeight);
    const p = world.project(pivot),
      h = world.project(new THREE.Vector3(...pivot).add(offset).toArray() as Vector);
    const bounds = world.canvas.getBoundingClientRect();
    this.root.style.left = `${p.x - bounds.left}px`;
    this.root.style.top = `${p.y - bounds.top}px`;
    const dx = h.x - p.x,
      dy = h.y - p.y,
      length = Math.hypot(dx, dy);
    this.direction = length > 1 ? { x: dx / length, y: dy / length } : { x: 0, y: -1 };
    this.handle.style.left = `${dx}px`;
    this.handle.style.top = `${dy}px`;
    this.handle.style.transform = `translate(-50%, -50%) rotate(${(Math.atan2(this.direction.y, this.direction.x) * 180) / Math.PI + 45}deg)`;
    this.card.style.left = `${dx + 34}px`;
    this.card.style.top = `${dy + 28}px`;
  }
  update(active: boolean, valid: boolean, busy: boolean, closing: boolean): void {
    this.root.hidden = !active;
    this.accept.disabled = !valid || busy;
    this.factor.disabled = closing;
    this.handle.dataset.invalid = String(!valid && this.factor.value !== "1");
  }
  dispose(): void {
    this.root.remove();
  }
}
