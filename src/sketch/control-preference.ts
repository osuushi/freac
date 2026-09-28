export type ControlMode = "trackpad" | "mouse";

const key = "freac.control";
let mode: ControlMode = "trackpad";
try {
  if (localStorage.getItem(key) === "mouse") mode = "mouse";
} catch {
  // Navigation still works when browser storage is unavailable.
}

export function controlMode(): ControlMode {
  return mode;
}

export function setControlMode(value: ControlMode): void {
  mode = value;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Keep the preference for this window when persistence is unavailable.
  }
}
