import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import {
  alignedAxis,
  markerMarkup,
  rotationOffset,
  rotationVisible,
  widgetRadius,
} from "../sketch/move-widget/geometry.js";
import type { Vector } from "../sketch/planes.js";
import { axes } from "./body-placement.js";
import { projectedAxis } from "./extrude-axis.js";
import { clearTransformArrow } from "./transform-clearance.js";
import { cameraFacingWidth } from "./widget-frame.js";
import "./body-gizmo.css";

export class BodyGizmo {
  readonly root = document.createElement("div");
  readonly input = document.createElement("input");
  readonly pivot = document.createElement("button");
  private handles: { axis: string; rotate: boolean; button: HTMLButtonElement }[] = [];
  constructor(
    overlay: HTMLElement,
    start: (event: PointerEvent, axis: string, rotate: boolean) => void,
    target = "body",
  ) {
    this.root.className = "body-gizmo";
    for (const rotate of [false, true])
      for (const axis of target === "edges" && !rotate ? ["X", "Y", "Z", "N"] : ["X", "Y", "Z"]) {
        const button = document.createElement("button");
        button.className = `body-axis-handle ${rotate ? "body-rotate-handle" : "body-translate-handle"}`;
        button.dataset.axis = axis;
        button.setAttribute(
          "aria-label",
          `${rotate ? "Rotate" : "Move"} ${target} ${axis === "N" ? "normal" : axis}`,
        );
        button.title = `${rotate ? "Rotate around" : "Move along"} ${axis === "N" ? "boundary normal" : axis} · drag or click to type`;
        button.addEventListener("pointerdown", (event) => start(event, axis, rotate));
        button.addEventListener("transform-numeric-tap", () =>
          start(new PointerEvent("pointerdown", { pointerId: -1 }), axis, rotate),
        );
        this.root.append(button);
        this.handles.push({ axis, rotate, button });
      }
    this.pivot.className = "body-pivot move-anchor";
    this.pivot.title = "Drag anchor · Command for free placement";
    this.pivot.setAttribute("aria-label", `Reposition ${target} pivot`);
    this.input.className = target === "body" ? "body-transform-value" : "face-transform-value";
    this.input.inputMode = "decimal";
    this.root.append(this.pivot, this.input);
    overlay.append(this.root);
  }
  update(
    editor: SketchEditor,
    pivot: Vector,
    movingPivot: boolean,
    translationOnly = false,
    normal: Vector | null = null,
  ): void {
    const world = editor.world,
      origin = world.project(pivot);
    if (!this.root.hidden) editor.transformAnchor = { point: [...pivot], active: true };
    this.root.style.left = `${origin.x}px`;
    this.root.style.top = `${origin.y}px`;
    this.pivot.setAttribute("aria-pressed", String(movingPivot));
    const aligned = alignedAxis(world.camera),
      names = ["X", "Y", "Z"];
    this.root.dataset.mode = aligned === null ? "3d" : "2d";
    const unit = world.height / world.canvas.clientHeight;
    for (const handle of this.handles) {
      const index = names.indexOf(handle.axis);
      handle.button.hidden =
        (handle.axis === "N" && !normal) ||
        (handle.rotate &&
          (movingPivot || translationOnly || !rotationVisible(world.camera, axes[handle.axis]))) ||
        (aligned !== null && (handle.rotate ? index !== aligned : index === aligned));
      if (handle.button.hidden) continue;
      const direction = handle.axis === "N" && normal ? normal : axes[handle.axis];
      const boundary = handle.axis === "N" ? projectedAxis(editor, pivot, direction) : null;
      let u: Vector, v: Vector, offset: THREE.Vector3;
      if (handle.rotate) {
        u = axes[names[(index + 1) % 3]];
        v = axes[names[(index + 2) % 3]];
        offset = new THREE.Vector3(...u)
          .add(new THREE.Vector3(...v))
          .multiplyScalar(rotationOffset);
      } else {
        u = boundary?.endOn
          ? (new THREE.Vector3(0, 1, 0)
              .applyQuaternion(world.camera.quaternion)
              .toArray() as Vector)
          : direction;
        v = cameraFacingWidth(world.camera, u);
        offset = new THREE.Vector3(...direction).multiplyScalar(
          handle.axis === "N" ? 102 : widgetRadius,
        );
      }
      const tip = new THREE.Vector3(...pivot).addScaledVector(offset, unit).toArray() as Vector;
      const end = world.project(handle.rotate ? tip : clearTransformArrow(editor, pivot, tip));
      if (boundary) {
        end.x = origin.x + boundary.x * 144;
        end.y = origin.y + boundary.y * 144;
      }
      const local = { x: end.x - origin.x, y: end.y - origin.y };
      handle.button.style.left = `${local.x}px`;
      handle.button.style.top = `${local.y}px`;
      handle.button.innerHTML = markerMarkup(world.camera, u, v, handle.rotate);
    }
  }
  dispose(): void {
    this.root.remove();
  }
}
