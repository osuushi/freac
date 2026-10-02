export class TrimBrushControls {
  readonly root = document.createElement("div");
  private slider = document.createElement("input");
  private field = document.createElement("input");
  diameter = 5;
  constructor(change: () => void, signal: AbortSignal) {
    this.root.className = "trim-brush-controls";
    this.root.hidden = true;
    const label = document.createElement("label"),
      unit = document.createElement("span"),
      hint = document.createElement("span");
    label.textContent = "Brush diameter";
    this.slider.type = "range";
    this.slider.min = "0.1";
    this.slider.max = "100";
    this.slider.step = "0.1";
    this.slider.setAttribute("aria-label", "Brush diameter slider");
    this.field.type = "number";
    this.field.min = "0.1";
    this.field.max = "10000";
    this.field.step = "0.1";
    this.field.setAttribute("aria-label", "Brush diameter");
    unit.textContent = "mm";
    hint.textContent = "⌥ drag · { / }";
    hint.className = "trim-brush-hint";
    label.append(this.field, unit);
    this.root.append(label, this.slider, hint);
    for (const input of [this.slider, this.field])
      input.addEventListener(
        "input",
        () => {
          const value = Number(input.value);
          if (!input.value || !Number.isFinite(value) || value < 0.1 || value > 10000) {
            input.setAttribute("aria-invalid", "true");
            return;
          }
          this.diameter = value;
          this.sync(input);
          change();
        },
        { signal },
      );
    this.field.addEventListener("blur", () => this.sync(), { signal });
    this.field.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.stopPropagation();
          this.sync();
          this.field.blur();
        }
      },
      { signal },
    );
    this.sync();
  }
  resize(event: KeyboardEvent): boolean {
    if (event.metaKey || event.ctrlKey) return false;
    const direction =
      event.code === "BracketLeft" || ["[", "{"].includes(event.key)
        ? -1
        : event.code === "BracketRight" || ["]", "}"].includes(event.key)
          ? 1
          : 0;
    if (!direction) return false;
    event.preventDefault();
    const scaled = Math.round(this.diameter * 10 * 1.2 ** direction) / 10,
      stepped = Math.round((this.diameter + direction * 0.1) * 10) / 10;
    this.diameter = Math.max(
      0.1,
      Math.min(10000, direction * (scaled - this.diameter) > 0 ? scaled : stepped),
    );
    this.sync();
    return true;
  }
  private sync(source?: HTMLInputElement): void {
    if (source !== this.slider) {
      this.slider.max = String(Math.max(100, this.diameter));
      this.slider.value = String(this.diameter);
    }
    if (source !== this.field) this.field.value = String(this.diameter);
    this.field.removeAttribute("aria-invalid");
    this.slider.removeAttribute("aria-invalid");
  }
}
