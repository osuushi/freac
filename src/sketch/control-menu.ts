import "./control-menu.css";
import { type ControlMode, controlMode, setControlMode } from "./control-preference.js";

export function installControlMenu(app: HTMLElement, tablet?: () => Promise<void>): void {
  const root = document.createElement("div");
  root.className = "control-selector";
  const button = document.createElement("button");
  button.textContent = "Control";
  button.setAttribute("aria-expanded", "false");
  const panel = document.createElement("div");
  panel.className = "control-menu";
  panel.id = "control-menu";
  panel.popover = "auto";
  button.popoverTargetElement = panel;
  button.setAttribute("aria-controls", panel.id);
  const group = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "Controls";
  group.append(legend);
  const updateHint = () => {
    const hint = app.querySelector(".navigation-hint");
    if (hint)
      hint.textContent =
        controlMode() === "mouse"
          ? "Wheel · zoom   Middle-drag · pan   Shift-middle-drag · orbit   Hold · choose overlap"
          : "Two-finger scroll · pan   ⌘-drag · orbit   Pinch · zoom   Hold · choose overlap";
  };
  updateHint();
  for (const value of ["trackpad", "mouse"] as const) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "control-mode";
    input.value = value;
    input.checked = controlMode() === value;
    input.onchange = () => {
      setControlMode(input.value as ControlMode);
      updateHint();
    };
    label.append(input, value === "mouse" ? "Mouse" : "Trackpad");
    group.append(label);
  }
  panel.append(group, document.createElement("hr"));
  const action = document.createElement("button");
  action.textContent = "Tablet";
  action.disabled = !tablet;
  if (!tablet) action.title = "Tablet handoff is available in the desktop app";
  action.onclick = async () => {
    panel.hidePopover();
    button.disabled = true;
    try {
      await tablet?.();
    } finally {
      button.disabled = false;
    }
  };
  panel.append(action);
  panel.addEventListener("beforetoggle", (event) => {
    const open = (event as ToggleEvent).newState === "open";
    button.setAttribute("aria-expanded", String(open));
    if (!open) return;
    const bounds = button.getBoundingClientRect();
    panel.style.top = `${bounds.bottom + 8}px`;
    panel.style.right = `${Math.max(8, window.innerWidth - bounds.right)}px`;
  });
  panel.addEventListener("toggle", () => {
    const open = panel.matches(":popover-open");
    if (open) {
      panel.querySelector<HTMLInputElement>("input:checked")?.focus();
    }
  });
  root.append(button, panel);
  app.querySelector("header")?.append(root);
}
