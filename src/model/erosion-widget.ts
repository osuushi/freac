import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { numericFocus } from "../tools/menu-focus.js";
import { distanceField, positionAxialPanel, toolAction, updateAxialArrow } from "./axial-widget.js";
import { projectedAxis } from "./extrude-axis.js";

export class ErosionWidget {
  readonly root = document.createElement("div");
  readonly handle = document.createElement("button");
  readonly thickness = document.createElement("input");
  readonly allowance = document.createElement("input");
  private panel = document.createElement("div");
  private description = document.createElement("small");
  private accept: HTMLButtonElement;
  private cancel: HTMLButtonElement;
  constructor(overlay: HTMLElement, finish: () => void, cancel: () => void) {
    this.root.className = "erosion-widget axial-widget";
    this.handle.className = "axial-arrow";
    this.handle.setAttribute("aria-label", "Erosion thickness handle");
    this.handle.title = "Erode · drag inward or click to type minimum thickness";
    this.accept = toolAction("Accept erosion", "m5 12 4 4L19 6", finish);
    this.cancel = toolAction("Cancel erosion", "m6 6 12 12M18 6 6 18", cancel);
    const actions = document.createElement("div");
    actions.className = "axial-actions";
    actions.append(this.accept, this.cancel);
    this.panel.className = "axial-panel";
    this.field(this.thickness, "Minimum thickness", "Minimum wall thickness in mm");
    this.field(
      this.allowance,
      "Extra thickness allowance",
      "Extra wall material allowed to simplify the cavity",
    );
    this.description.style.cssText = "display:block;max-width:190px;padding:5px 0;line-height:1.4";
    this.panel.append(this.description, actions);
    this.root.append(this.handle, this.panel);
    this.root.hidden = true;
    overlay.append(this.root);
  }
  private field(input: HTMLInputElement, name: string, title: string): void {
    input.type = "text";
    input.inputMode = "decimal";
    input.setAttribute("aria-label", name);
    input.title = title;
    const label = document.createElement("small");
    label.textContent = name;
    label.style.cssText = "display:block;padding-top:5px";
    this.panel.append(label, distanceField(input));
  }
  update(
    editor: SketchEditor,
    axis: { center: Vector; normal: Vector },
    values: { thickness: number; allowance: number },
    active: boolean,
    valid: boolean,
    invalid: boolean,
    count: number | null,
  ): void {
    this.root.hidden = false;
    positionAxialPanel(this.root, this.panel, editor.world.project(axis.center));
    updateAxialArrow(
      this.handle,
      editor.world.camera,
      axis.normal,
      "shell",
      projectedAxis(editor, axis.center, axis.normal),
      invalid,
    );
    for (const [input, value] of [
      [this.thickness, values.thickness],
      [this.allowance, values.allowance],
    ] as const) {
      if (!numericFocus(input))
        input.value = Number.isFinite(value) ? String(Number(value.toPrecision(4))) : "";
      input.setAttribute("aria-invalid", String(invalid));
    }
    this.description.textContent =
      count === null
        ? "Creates cavity copies · originals retained"
        : count === 0
          ? "No interior remains · originals retained"
          : `${count} cavity ${count === 1 ? "body" : "bodies"} · originals retained`;
    this.accept.disabled = !active || !valid || values.thickness <= 0 || editor.blocked;
    this.cancel.disabled = !active;
  }
  dispose(): void {
    this.root.remove();
  }
}
