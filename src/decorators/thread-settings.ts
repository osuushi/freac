import type { DecoratorField, Settings } from "./types.js";

export const threadDefinition = "freac.threads";
export interface ThreadSettings extends Settings {
  preset: "metric" | "print-upright" | "print-sideways" | "custom";
  pitch: number;
  profile: "metric" | "rounded";
  hand: "right" | "left";
  cut: "rod" | "hole";
  clearance: number;
  start: number;
  end: number;
  startTaper: number;
  endTaper: number;
}

export const threadFields: readonly DecoratorField[] = [
  {
    key: "preset",
    label: "Preset",
    type: "enum",
    options: [
      { value: "metric", label: "Metric" },
      { value: "print-upright", label: "Print upright" },
      { value: "print-sideways", label: "Print sideways" },
      { value: "custom", label: "Custom" },
    ],
  },
  { key: "pitch", label: "Pitch", type: "number", unit: "mm", min: 0.05, max: 100 },
  {
    key: "profile",
    label: "Profile",
    type: "enum",
    options: [
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
    label: "Cut into",
    type: "enum",
    options: [
      { value: "rod", label: "Rod — hole ridges inward" },
      { value: "hole", label: "Hole — rod ridges outward" },
    ],
  },
  { key: "clearance", label: "Hole radial relief", type: "number", unit: "mm", min: 0, max: 10 },
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

export function threadDefaults(diameter: number, preset = "metric"): ThreadSettings {
  const nearest = coarse.reduce((a, b) =>
    Math.abs(b[0] - diameter) < Math.abs(a[0] - diameter) ? b : a,
  );
  const print = preset === "print-upright" || preset === "print-sideways";
  return {
    preset: preset as ThreadSettings["preset"],
    pitch: Math.max(nearest[1], preset === "print-sideways" ? 2 : print ? 1.2 : 0),
    profile: print ? "rounded" : "metric",
    hand: "right",
    cut: "rod",
    clearance: print ? 0.2 : 0.1,
    start: 0,
    end: 0,
    startTaper: 0,
    endTaper: 0,
  };
}

export function threadSettings(settings: Settings): ThreadSettings {
  for (const field of threadFields) {
    const value = settings[field.key];
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
  return settings as ThreadSettings;
}
