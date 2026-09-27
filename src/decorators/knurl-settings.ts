import type { DecoratorField, Settings } from "./types.js";

export type KnurlSettings = Settings & {
  preset: "fine" | "coarse" | "custom";
  mode: "recessed" | "raised";
  spacing: number;
  depth: number;
};
const presets = {
  fine: { spacing: 2.4, depth: 0.4 },
  coarse: { spacing: 3.6, depth: 0.6 },
};
export const knurlFields: readonly DecoratorField[] = [
  {
    key: "preset",
    label: "Knurl preset",
    type: "enum",
    default: "fine",
    options: [
      { value: "fine", label: "Fine" },
      { value: "coarse", label: "Coarse" },
      { value: "custom", label: "Custom" },
    ],
  },
  {
    key: "mode",
    label: "Knurl relief",
    type: "enum",
    default: "recessed",
    options: [
      { value: "recessed", label: "Recessed" },
      { value: "raised", label: "Raised" },
    ],
  },
  {
    key: "spacing",
    label: "Knurl spacing",
    type: "number",
    unit: "mm",
    min: 0.4,
    max: 50,
    default: 2.4,
  },
  {
    key: "depth",
    label: "Knurl depth",
    type: "number",
    unit: "mm",
    min: 0.05,
    max: 5,
    default: 0.4,
  },
];
export function knurlSettings(input: Settings): KnurlSettings {
  const result = { preset: "fine", mode: "recessed", ...presets.fine, ...input };
  for (const field of knurlFields) {
    const value = result[field.key as keyof typeof result];
    if (
      field.type === "enum"
        ? !field.options?.some((o) => o.value === value)
        : typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < (field.min ?? 0) ||
          value > (field.max ?? Infinity)
    )
      throw new Error(`Invalid ${field.label}`);
  }
  if (Object.keys(input).some((key) => !knurlFields.some((f) => f.key === key)))
    throw new Error("Unknown knurl setting");
  return result as KnurlSettings;
}
export function patchKnurlSettings(previous: Settings, patch: Settings): KnurlSettings {
  const preset = patch.preset;
  const defaults =
    typeof preset === "string" && preset in presets ? presets[preset as keyof typeof presets] : {};
  const result = knurlSettings({ ...previous, ...defaults, ...patch });
  if (patch.preset === undefined && (patch.spacing !== undefined || patch.depth !== undefined))
    result.preset = "custom";
  return result;
}

/** Repeat around the entire support cylinder, including when only a patch is selected. */
export function knurlDimensions(radius: number, settings: KnurlSettings) {
  const repeats = Math.max(3, Math.round((2 * Math.PI * radius) / settings.spacing));
  return { repeats, pitch: (2 * Math.PI * radius) / repeats };
}
