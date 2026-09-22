import { numericFocus, toolMenuOpen } from "../tools/menu-focus.js";
import type { ExtrusionDraft } from "./body.js";

/** The selected unit is the driving quantity when the extrusion length changes. */
export class ExtrudeDraft {
  readonly root = document.createElement("div");
  readonly input = document.createElement("input");
  readonly unit = document.createElement("select");
  private distance = 0;
  private amount = 0;
  private mode: ExtrusionDraft["mode"] = "angle";
  get value(): ExtrusionDraft {
    return { mode: this.mode, value: this.amount };
  }
  constructor(changed: () => void) {
    this.root.className = "extrude-draft";
    this.unit.setAttribute("aria-label", "Draft measurement");
    for (const [value, label] of [
      ["angle", "Angle (°)"],
      ["offset", "Offset (mm)"],
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      this.unit.append(option);
    }
    this.input.type = "text";
    this.input.inputMode = "decimal";
    this.input.setAttribute("aria-label", "Draft value");
    this.input.title = "Draft angle in degrees · positive expands material at the far end";
    this.root.append("Draft ", this.unit, this.input);
    this.input.onfocus = () => {
      if (toolMenuOpen()) return;
      this.input.value = String(this.amount);
      this.input.select();
    };
    this.input.onblur = () => this.update(this.distance);
    this.input.oninput = () => {
      this.amount = this.input.value.trim() ? Number(this.input.value) : NaN;
      this.update(this.distance);
      changed();
    };
    this.unit.onchange = () => {
      const draft = this.value;
      const value =
        draft.mode === "angle"
          ? Math.abs(this.distance) * Math.tan((draft.value * Math.PI) / 180)
          : (Math.atan(draft.value / Math.abs(this.distance)) * 180) / Math.PI;
      this.mode = this.unit.value as ExtrusionDraft["mode"];
      this.amount = draft.value === 0 ? 0 : value;
      this.input.value = String(Number(this.amount.toPrecision(4)));
      this.update(this.distance);
      this.input.title =
        this.mode === "angle"
          ? "Draft angle in degrees · positive expands material at the far end"
          : "End offset per wall in mm · positive expands material and narrows holes";
      changed();
    };
    this.reset();
  }
  reset(): void {
    this.mode = "angle";
    this.unit.value = this.mode;
    this.amount = 0;
    this.input.value = "0";
    this.input.title = "Draft angle in degrees · positive expands material at the far end";
    this.update(0);
  }
  update(distance: number): void {
    this.distance = distance;
    const draft = this.value;
    if (!numericFocus(this.input))
      this.input.value = Number.isFinite(this.amount)
        ? String(Number(this.amount.toPrecision(4)))
        : "";
    this.unit.disabled =
      !Number.isFinite(draft.value) ||
      (draft.mode === "angle" && Math.abs(draft.value) >= 90) ||
      (draft.value !== 0 && (!Number.isFinite(distance) || Math.abs(distance) < 1e-8));
  }
}
