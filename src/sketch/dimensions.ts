import { idleReason, toolCatalog } from "../tools/catalog.js";
import { numericFocus, toolMenuOpen } from "../tools/menu-focus.js";
import type { InteractionLease } from "./active-interaction.js";
import { layoutLocalControls } from "./control-layout.js";
import { cornerLock } from "./corner-angle.js";
import { selectedCorner, toggleCornerLock } from "./corner-angle-controls.js";
import { dimensionLock, dimensionLockTarget, toggleDimensionLock } from "./dimension-locks.js";
import { changeDimension, dimensionValues } from "./dimension-values.js";
import type { Quantity } from "./drag-state.js";
import type { SketchEditor } from "./editor.js";
import { focusNumericField } from "./numeric-focus.js";
import { sketchIcon } from "./sketch-icons.js";

export class Dimensions {
  private key = "";
  private disposeTools: () => void;
  private duplicate = false;
  private interaction: InteractionLease | null = null;
  private committing: Promise<void> | null = null;
  private fields: {
    quantity: Quantity;
    label: HTMLLabelElement;
    input: HTMLInputElement;
    lock: HTMLButtonElement;
  }[] = [];
  private readonly abort = new AbortController();
  constructor(
    private editor: SketchEditor,
    private overlay: HTMLElement,
  ) {
    const disposers = (["width", "height", "length", "radius", "cornerAngle"] as const).map(
      (quantity) =>
        toolCatalog(editor).register({
          id: `lock-${quantity}`,
          label: `Toggle ${quantity === "cornerAngle" ? "corner angle" : quantity} lock`,
          category: "Constrain",
          aliases: [`constrain ${quantity}`],
          reason: () =>
            (editor.interactions.current?.kind === "numeric" ? null : idleReason(editor)) ??
            ((
              quantity === "cornerAngle"
                ? selectedCorner(editor)
                : dimensionLockTarget(editor, quantity)
            )
              ? null
              : "Select geometry with this dimension"),
          run: () =>
            quantity === "cornerAngle"
              ? toggleCornerLock(editor)
              : toggleDimensionLock(editor, quantity),
        }),
    );
    this.disposeTools = () => {
      for (const dispose of disposers) dispose();
    };
    editor.commitNumeric = () => this.commitFocused();
    editor.cancelNumeric = () => this.cancel();
    editor.focusQuantity = (quantity, duplicate = false) => {
      this.fields.find((f) => f.quantity === quantity)?.input.focus();
      this.duplicate = duplicate;
    };
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (event.target instanceof HTMLInputElement) return;
        if (event.target instanceof Element && event.target.closest(".dimension-lock")) return;
        if (
          event.target instanceof Element &&
          event.target.closest("[data-history], [data-action]")
        )
          this.cancel();
        else this.commitFocused();
      },
      { capture: true, signal: this.abort.signal },
    );
    editor.world.changed.add(this.update);
  }
  update = (): void => {
    const values = dimensionValues(this.editor);
    const key = values.length
      ? `${this.editor.sketch?.id}/${[...this.editor.selectionOwners].sort().join()}/${values.map((v) => v.quantity).join()}`
      : "";
    if (key !== this.key) {
      if (!this.committing) this.cancel();
      for (const field of this.fields) field.label.remove();
      this.fields = [];
      this.key = key;
      for (const value of values) this.addField(value.quantity, value.label, value.unit);
    }
    const bounds = this.editor.world.canvas.getBoundingClientRect();
    for (const value of values) {
      const field = this.fields.find((item) => item.quantity === value.quantity);
      if (!field) continue;
      field.input.readOnly = this.editor.blocked && !this.editor.isDragging;
      const corner = selectedCorner(this.editor);
      const locked =
        value.quantity === "cornerAngle"
          ? !!(corner && this.editor.sketch && cornerLock(this.editor.sketch, corner))
          : !!dimensionLock(this.editor, value.quantity);
      field.lock.hidden =
        (value.quantity === "cornerAngle"
          ? !corner
          : !dimensionLockTarget(this.editor, value.quantity)) || this.editor.isDragging;
      field.lock.disabled = this.editor.blocked;
      field.lock.replaceChildren(sketchIcon(locked ? "lock" : "unlock"));
      field.lock.setAttribute("aria-label", `${locked ? "Unlock" : "Lock"} ${value.label}`);
      field.lock.setAttribute("aria-pressed", String(locked));
      field.label.style.left = `${Math.max(50, Math.min(bounds.width - 50, value.screen.x - bounds.left))}px`;
      field.label.style.top = `${Math.max(70, Math.min(bounds.height - 60, value.screen.y - bounds.top))}px`;
      if (!numericFocus(field.input)) field.input.value = this.format(value.value);
    }
    layoutLocalControls(this.editor, this.overlay);
  };
  private format(value: number): string {
    return Number(value.toFixed(4)).toString();
  }
  private addField(quantity: Quantity, name: string, suffix: string): void {
    const label = document.createElement("label");
    label.className = "dimension";
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.setAttribute("aria-label", name);
    input.autocomplete = "off";
    input.spellcheck = false;
    const unit = document.createElement("span");
    unit.textContent = suffix;
    const lock = document.createElement("button");
    lock.type = "button";
    lock.className = "dimension-lock";
    // Keep the field focused until the click can commit it and then toggle the lock.
    lock.addEventListener("pointerdown", (event) => event.preventDefault());
    lock.addEventListener("click", async () => {
      if (quantity === "cornerAngle") await toggleCornerLock(this.editor);
      else await toggleDimensionLock(this.editor, quantity);
      input.blur();
    });
    label.append(input, unit, lock);
    this.overlay.append(label);
    this.fields.push({ quantity, label, input, lock });
    input.addEventListener("focus", () => {
      if (toolMenuOpen()) return;
      this.interaction ??= this.editor.interactions.acquire("numeric", () => this.cancel());
      input.dataset.original = input.value;
      input.select();
    });
    input.addEventListener("blur", async () => {
      if (toolMenuOpen()) return;
      await this.commit(input, quantity);
      this.editor.refresh();
    });
    input.addEventListener("keydown", async (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.cancel();
        input.blur();
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        await this.commit(input, quantity);
        input.blur();
      }
      if (event.key === "Tab") {
        event.preventDefault();
        await this.commit(input, quantity);
        focusNumericField(this.overlay, event.shiftKey);
      }
    });
  }
  private commit(input: HTMLInputElement, quantity: Quantity): Promise<void> {
    if (this.committing) return this.committing;
    const interaction = this.interaction;
    if (input.value === input.dataset.original) {
      this.interaction = null;
      this.duplicate = false;
      interaction?.release();
      return Promise.resolve();
    }
    interaction?.close();
    this.committing = this.apply(input, quantity).finally(() => {
      this.committing = null;
      if (this.interaction === interaction) this.interaction = null;
      this.duplicate = false;
      interaction?.release();
    });
    return this.committing;
  }
  private async apply(input: HTMLInputElement, quantity: Quantity): Promise<void> {
    if (input.value === input.dataset.original) return;
    const current = dimensionValues(this.editor).find((item) => item.quantity === quantity);
    if (!current) return;
    const value = Number(input.value.trim());
    if (value === current.value && !(this.editor.line && quantity === "radius")) return;
    try {
      if (!input.value.trim()) throw new Error("Enter a number");
      input.dataset.original = input.value;
      await changeDimension(
        this.editor,
        quantity,
        value,
        this.interaction ?? undefined,
        this.duplicate,
      );
      input.removeAttribute("aria-invalid");
    } catch (error) {
      input.value = this.format(current.value);
      input.dataset.original = input.value;
      input.setAttribute("aria-invalid", "true");
      this.editor.message = error instanceof Error ? error.message : String(error);
      this.editor.refresh();
    }
  }
  private async commitFocused(): Promise<void> {
    const field = this.fields.find((item) => item.input === document.activeElement);
    if (field) await this.commit(field.input, field.quantity);
  }
  cancel(): void {
    if (this.committing) return;
    this.duplicate = false;
    const interaction = this.interaction;
    this.interaction = null;
    const values = dimensionValues(this.editor);
    for (const field of this.fields) {
      const value = values.find((item) => item.quantity === field.quantity);
      if (value) {
        field.input.value = this.format(value.value);
        field.input.dataset.original = field.input.value;
        field.input.removeAttribute("aria-invalid");
      }
    }
    interaction?.release();
  }
  focusFirst(initial?: string): void {
    const input = this.fields[0]?.input;
    if (!input) return;
    input.focus();
    if (initial !== undefined) input.value = initial;
  }
  dispose(): void {
    this.cancel();
    this.disposeTools();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    for (const field of this.fields) field.label.remove();
  }
}
