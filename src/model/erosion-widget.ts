import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { numericFocus } from "../tools/menu-focus.js";
import { distanceField, positionAxialPanel, toolAction, updateAxialArrow } from "./axial-widget.js";
import type { Body, BodyErosion } from "./body.js";
import { projectedAxis } from "./extrude-axis.js";
import { offsetHandle } from "./face-offset-targets.js";
import "./erosion-widget.css";

export function erosionAxis(editor: SketchEditor, body: Body): { center: Vector; normal: Vector } {
  const face = body.faces[0];
  const handle =
    face && (face.plane || face.cylinder || face.offsetHandle) ? offsetHandle(editor, face) : null;
  return handle
    ? { center: handle.center, normal: [-handle.normal[0], -handle.normal[1], -handle.normal[2]] }
    : { center: body.center, normal: [0, 0, -1] };
}

export class ErosionWidget {
  readonly root = document.createElement("div");
  readonly handle = document.createElement("button");
  readonly thickness = document.createElement("input");
  readonly allowance = document.createElement("input");
  readonly method = document.createElement("select");
  private panel = document.createElement("div");
  private description = document.createElement("small");
  private accept: HTMLButtonElement;
  private cancel: HTMLButtonElement;
  private keep: HTMLButtonElement;
  private suggestion = document.createElement("button");
  constructor(
    overlay: HTMLElement,
    finish: () => void,
    cancel: () => void,
    keep: () => void,
    suggest: () => void,
  ) {
    this.root.className = "erosion-widget axial-widget";
    this.handle.className = "axial-arrow";
    this.handle.setAttribute("aria-label", "Erosion thickness handle");
    this.handle.title = "Erode · drag inward or click to type minimum thickness";
    this.accept = toolAction("Accept erosion", "m5 12 4 4L19 6", finish);
    this.cancel = toolAction("Cancel erosion", "m6 6 12 12M18 6 6 18", cancel);
    this.keep = toolAction("Keep originals", "M8 8h13v13H8ZM3 16V3h13", keep);
    const actions = document.createElement("div");
    actions.className = "axial-actions";
    actions.append(this.keep, this.accept, this.cancel);
    this.panel.className = "axial-panel";
    this.method.setAttribute("aria-label", "Erosion method");
    this.method.title = "Fast reconstructs an eroded mesh; Accurate uses CAD offsets";
    for (const [value, label] of [
      ["fast", "Fast"],
      ["accurate", "Accurate"],
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      this.method.append(option);
    }
    this.panel.append(this.method);
    this.field(this.thickness, "Minimum thickness", "Minimum wall thickness in mm");
    this.field(
      this.allowance,
      "Extra thickness allowance",
      "Extra thickness as a percentage of minimum thickness",
      "%",
    );
    this.description.className = "erosion-status";
    this.description.setAttribute("role", "status");
    this.suggestion.className = "erosion-suggestion";
    this.suggestion.type = "button";
    this.suggestion.setAttribute("aria-label", "Try suggested allowance");
    this.suggestion.onclick = suggest;
    this.panel.append(this.description, this.suggestion, actions);
    this.root.append(this.handle, this.panel);
    this.root.hidden = true;
    overlay.append(this.root);
  }
  private field(input: HTMLInputElement, name: string, title: string, unit = "mm"): void {
    input.type = "text";
    input.inputMode = "decimal";
    input.setAttribute("aria-label", name);
    input.title = title;
    const label = document.createElement("small");
    label.textContent = name;
    label.className = "erosion-field-label";
    const field = distanceField(input);
    field.querySelector("span")?.replaceChildren(unit);
    this.panel.append(label, field);
  }
  update(
    editor: SketchEditor,
    axis: { center: Vector; normal: Vector },
    values: {
      thickness: number;
      allowancePercent: number;
      keepOriginals: boolean;
      method: BodyErosion["method"];
    },
    active: boolean,
    valid: boolean,
    invalid: boolean,
    count: number | null,
    suggestion: number | null,
  ): void {
    this.root.hidden = false;
    this.method.value = values.method ?? "fast";
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
      [this.allowance, values.allowancePercent],
    ] as const) {
      if (!numericFocus(input))
        input.value = Number.isFinite(value) ? String(Number(value.toPrecision(4))) : "";
      input.setAttribute("aria-invalid", String(invalid));
    }
    this.description.textContent = invalid
      ? editor.message || "Could not create a result at these values"
      : count === null
        ? "Erode selected bodies"
        : count === 0
          ? "Empty result"
          : `${count} result ${count === 1 ? "body" : "bodies"}`;
    this.suggestion.hidden = suggestion === null;
    this.suggestion.disabled = editor.blocked;
    this.suggestion.textContent = suggestion === null ? "" : `Try ${suggestion}% allowance`;
    this.suggestion.title =
      "Suggested from the remaining interior regions; minimum thickness stays unchanged";
    this.keep.setAttribute("aria-pressed", String(values.keepOriginals));
    this.keep.disabled = editor.blocked;
    this.accept.disabled = !active || !valid || values.thickness <= 0 || editor.blocked;
    this.cancel.disabled = !active;
  }
  dispose(): void {
    this.root.remove();
  }
}
