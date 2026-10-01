import type { BooleanMode, LiftSource } from "./body.js";

/** Ordered temporary sections; accepted geometry has no source dependency. */
export interface Loft {
  sources: LiftSource[];
  ruled: boolean;
  /** Optional integer seam steps after automatic boundary correspondence. */
  alignment?: number[];
  mode: BooleanMode | "auto";
  targets?: string[];
  eligibleTargets?: string[];
}

export function validateLoft(input: Loft): void {
  if (!Array.isArray(input.sources) || input.sources.length < 2 || input.sources.length > 256)
    throw new Error("Loft needs 2–256 ordered sections");
  const keys = input.sources.map((source) => {
    if (!source || typeof source !== "object") throw new Error("Invalid loft section");
    if ("face" in source && typeof source.face === "string") return `face:${source.face}`;
    if (
      "sketch" in source &&
      typeof source.sketch === "string" &&
      typeof source.profile === "string"
    )
      return `sketch:${source.sketch}:${source.profile}`;
    throw new Error("Invalid loft section");
  });
  if (new Set(keys).size !== keys.length) throw new Error("Select each loft section only once");
  if (typeof input.ruled !== "boolean") throw new Error("Choose Smooth or Ruled loft");
  if (!["auto", "new", "union", "subtract", "intersect"].includes(input.mode))
    throw new Error("Unknown loft Boolean mode");
  if (
    input.alignment !== undefined &&
    (!Array.isArray(input.alignment) ||
      input.alignment.length !== input.sources.length ||
      input.alignment.some((value) => !Number.isInteger(value) || Math.abs(value) > 2147483647))
  )
    throw new Error("Loft alignment needs one integer seam step per section");
}
