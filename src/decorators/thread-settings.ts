import type { DecoratorField, Settings } from "./types.js";

export const threadDefinition = "freac.threads";
export interface ThreadSettings extends Settings {
  preset: "fdm-fine" | "fdm-coarse" | "metric" | "print-upright" | "print-sideways" | "custom";
  pitch: number;
  profile: "triangle" | "metric" | "rounded";
  hand: "right" | "left";
  cut: "rod" | "hole";
  clearance: number;
  tipTruncation: number;
  start: number;
  end: number;
  startTaper: number;
  endTaper: number;
  layerHeight: number;
  nozzleDiameter: number;
}

export const threadFields: readonly DecoratorField[] = [
  {
    key: "preset",
    label: "Preset",
    type: "enum",
    options: [
      { value: "fdm-fine", label: "FDM fine" },
      { value: "fdm-coarse", label: "FDM coarse" },
      { value: "metric", label: "Metric" },
      { value: "print-upright", label: "Print upright" },
      { value: "print-sideways", label: "Print sideways" },
      { value: "custom", label: "Custom" },
    ],
  },
  {
    key: "layerHeight",
    label: "Layer height",
    type: "number",
    unit: "mm",
    min: 0.01,
    max: 5,
    default: 0.2,
    visibleWhen: { key: "preset", values: ["print-upright", "print-sideways"] },
  },
  {
    key: "nozzleDiameter",
    label: "Nozzle diameter",
    type: "number",
    unit: "mm",
    min: 0.05,
    max: 10,
    default: 0.4,
    visibleWhen: { key: "preset", values: ["print-upright", "print-sideways"] },
  },
  { key: "pitch", label: "Pitch", type: "number", unit: "mm", min: 0.05, max: 100 },
  {
    key: "profile",
    label: "Profile",
    type: "enum",
    options: [
      { value: "triangle", label: "FDM triangle · 1 mm envelope" },
      { value: "metric", label: "Metric 60°" },
      { value: "rounded", label: "Rounded" },
    ],
  },
  {
    key: "hand",
    label: "Handedness",
    type: "enum",
    options: [
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  {
    key: "cut",
    label: "Thread placement",
    type: "enum",
    options: [
      { value: "rod", label: "Inside reference diameter" },
      { value: "hole", label: "Outside reference diameter" },
    ],
  },
  { key: "clearance", label: "Clearance", type: "number", unit: "mm", min: 0, max: 10 },
  {
    key: "tipTruncation",
    label: "Tip truncation",
    type: "number",
    unit: "mm",
    min: 0,
    max: 0.49,
    default: 0,
    visibleWhen: { key: "profile", values: ["triangle"] },
  },
  { key: "start", label: "Start inset", type: "number", unit: "mm", min: 0 },
  { key: "end", label: "End inset", type: "number", unit: "mm", min: 0 },
  { key: "startTaper", label: "Start taper", type: "number", unit: "mm", min: 0 },
  { key: "endTaper", label: "End taper", type: "number", unit: "mm", min: 0 },
];

// ISO metric coarse nominal diameter/pitch pairs; tie goes to the smaller diameter.
// Reference table: https://sg.misumi-ec.com/tech-info/categories/technical_data/td01/a0063.html
const coarse = [
  [1, 0.25],
  [1.2, 0.25],
  [1.4, 0.3],
  [1.6, 0.35],
  [1.8, 0.35],
  [2, 0.4],
  [2.5, 0.45],
  [3, 0.5],
  [3.5, 0.6],
  [4, 0.7],
  [5, 0.8],
  [6, 1],
  [7, 1],
  [8, 1.25],
  [10, 1.5],
  [12, 1.75],
  [14, 2],
  [16, 2],
  [18, 2.5],
  [20, 2.5],
  [22, 2.5],
  [24, 3],
  [27, 3],
  [30, 3.5],
  [33, 3.5],
  [36, 4],
  [39, 4],
  [42, 4.5],
  [45, 4.5],
  [48, 5],
  [52, 5],
  [56, 5.5],
  [60, 5.5],
  [64, 6],
];

export function coarseMetric(diameter: number) {
  const nearest = coarse.reduce((a, b) =>
    Math.abs(b[0] - diameter) < Math.abs(a[0] - diameter) ? b : a,
  );
  return {
    diameter: nearest[0],
    pitch: nearest[1],
    listed: Math.abs(diameter - nearest[0]) < 1e-7,
  };
}

/** FDM triangles keep a 1 mm radial envelope before clipping either tip. */
export function threadDepth(settings: ThreadSettings): number {
  return settings.profile === "triangle" ? 1 : (settings.pitch * Math.sqrt(3) * 5) / 16;
}

export function threadDefaults(
  diameter: number,
  preset: ThreadSettings["preset"] = "fdm-fine",
  printing: { layerHeight: number; nozzleDiameter: number } = {
    layerHeight: 0.2,
    nozzleDiameter: 0.4,
  },
): ThreadSettings {
  const print = preset === "print-upright" || preset === "print-sideways";
  const sideways = preset === "print-sideways";
  const fdm = preset === "fdm-fine" || preset === "fdm-coarse";
  return {
    layerHeight: printing.layerHeight,
    nozzleDiameter: printing.nozzleDiameter,
    preset,
    pitch: fdm
      ? preset === "fdm-fine"
        ? 1
        : 1.5
      : print
        ? Math.max(
            coarseMetric(diameter).pitch,
            printing.layerHeight * (sideways ? 10 : 6),
            printing.nozzleDiameter * (sideways ? 5 : 3),
          )
        : coarseMetric(diameter).pitch,
    profile: fdm ? "triangle" : print ? "rounded" : "metric",
    hand: "right",
    cut: "rod",
    clearance: fdm ? 0.05 : print ? printing.nozzleDiameter / 2 : 0.1,
    tipTruncation: fdm ? 0.1 : 0,
    start: 0,
    end: 0,
    startTaper: 0,
    endTaper: 0,
  };
}

export function threadSettings(settings: Settings): ThreadSettings {
  const normalized: Settings = {
    layerHeight: 0.2,
    nozzleDiameter: 0.4,
    tipTruncation: 0,
    ...settings,
  };
  for (const field of threadFields) {
    const value = normalized[field.key];
    if (field.type === "number") {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < (field.min ?? -Infinity) ||
        value > (field.max ?? Infinity)
      )
        throw new Error(`Invalid thread ${field.label.toLowerCase()}`);
    } else if (!field.options?.some((option) => option.value === value))
      throw new Error(`Invalid thread ${field.label.toLowerCase()}`);
  }
  if (Object.keys(settings).some((key) => !threadFields.some((field) => field.key === key)))
    throw new Error("Unknown thread setting");
  return normalized as ThreadSettings;
}

/** Resolve a preset only on explicit preset/printer edits, never on geometry changes. */
export function patchThreadSettings(
  diameter: number,
  settings: Settings,
  patch: Settings,
): ThreadSettings {
  const merged = threadSettings({ ...threadSettings(settings), ...patch });
  const printing = merged.preset === "print-upright" || merged.preset === "print-sideways";
  let resolved = merged;
  if (
    (patch.preset && patch.preset !== "custom") ||
    (printing && (patch.layerHeight !== undefined || patch.nozzleDiameter !== undefined))
  ) {
    const { pitch, profile, clearance, tipTruncation } = threadDefaults(
      diameter,
      merged.preset,
      merged,
    );
    resolved = threadSettings({ ...merged, pitch, profile, clearance, tipTruncation, ...patch });
  }
  if (resolved.preset === "fdm-fine" || resolved.preset === "fdm-coarse") {
    const defaults = threadDefaults(diameter, resolved.preset);
    if (
      resolved.pitch !== defaults.pitch ||
      resolved.profile !== defaults.profile ||
      resolved.tipTruncation !== defaults.tipTruncation
    )
      return threadSettings({ ...resolved, preset: "custom" });
  }
  return resolved;
}
