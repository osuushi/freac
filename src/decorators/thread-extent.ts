import type { BodyGeometry } from "../model/body.js";
import { cylinderExtent, resolveFaces } from "./cylinder.js";
import type { DecoratorInstance } from "./types.js";

export function threadReference(
  bodies: readonly BodyGeometry[],
  instance: DecoratorInstance,
): [number, number] {
  return (
    instance.axialReference ?? cylinderExtent(instance.frame, resolveFaces(bodies, instance.faces))
  );
}

export function validateAxialReference(instance: DecoratorInstance): void {
  const range = instance.axialReference;
  if (
    range !== undefined &&
    (!Array.isArray(range) ||
      range.length !== 2 ||
      !range.every((n) => typeof n === "number" && Number.isFinite(n)) ||
      range[1] <= range[0])
  )
    throw new Error("Invalid decorator axial reference");
}
