import type { BodyBoolean } from "./body.js";
import { modeIcons } from "./boolean-icons.js";
import { cleanupButton } from "./cleanup-button.js";
import "./boolean-widget.css";

export class BooleanWidget {
  readonly cleanup = cleanupButton();
  readonly root = document.createElement("div");
  private keep = document.createElement("button");
  private target = document.createElement("button");
  private status = document.createElement("span");
  constructor(
    overlay: HTMLElement,
    mode: (value: BodyBoolean["mode"]) => void,
    keep: () => void,
    target: () => void,
    accept: () => void,
    cancel: () => void,
  ) {
    this.root.className = "boolean-widget";
    this.root.hidden = true;
    for (const value of ["union", "subtract", "intersect"] as const) {
      const button = document.createElement("button");
      button.dataset.mode = value;
      button.title = `${value[0].toUpperCase()}${value.slice(1)}`;
      button.setAttribute("aria-label", button.title);
      button.innerHTML = `<svg viewBox="0 0 24 24">${modeIcons[value]}</svg>`;
      button.onclick = () => mode(value);
      this.root.append(button);
    }
    this.keep.setAttribute("aria-label", "Keep originals");
    this.keep.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 8h13v13H8ZM3 16V3h13"/></svg>';
    this.keep.onclick = keep;
    this.target.setAttribute("aria-label", "Change subtraction target");
    this.target.title = "Cycle the target body; the other selected bodies are cutting tools";
    this.target.onclick = target;
    this.status.className = "boolean-status";
    this.root.append(this.keep, this.target, this.status);
    for (const [name, symbol, action] of [
      ["Accept Boolean", '<path d="m5 12 4 4L20 5"/>', accept],
      ["Cancel Boolean", '<path d="m6 6 12 12M6 18 18 6"/>', cancel],
    ] as const) {
      const button = document.createElement("button");
      button.setAttribute("aria-label", name);
      button.title = name === "Accept Boolean" ? "Accept (Enter)" : "Cancel (Escape)";
      button.innerHTML = `<svg viewBox="0 0 24 24">${symbol}</svg>`;
      button.onclick = action;
      this.root.append(button);
    }
    this.root.append(this.cleanup);
    overlay.append(this.root);
  }
  update(operation: BodyBoolean, target: string, busy: boolean, valid: boolean, count: number) {
    this.root.hidden = false;
    this.keep.setAttribute("aria-pressed", String(operation.keepOriginals));
    this.keep.title =
      operation.mode === "subtract" ? "Keep original cutting tools" : "Keep all original bodies";
    this.target.hidden = operation.mode !== "subtract";
    this.target.textContent = `Target: ${target} ↔`;
    this.status.textContent = busy
      ? "Calculating…"
      : !valid
        ? "No valid result"
        : count
          ? `${count} result ${count === 1 ? "body" : "bodies"}`
          : "Empty result · Enter to accept";
    for (const button of this.root.querySelectorAll("button")) {
      const name = button.getAttribute("aria-label");
      button.disabled =
        name === "Cancel Boolean"
          ? false
          : busy || ((name === "Accept Boolean" || button === this.cleanup) && !valid);
      if (button.dataset.mode)
        button.setAttribute("aria-pressed", String(button.dataset.mode === operation.mode));
    }
  }
  dispose() {
    this.root.remove();
  }
}
