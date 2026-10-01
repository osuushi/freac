import type { DisplayDocument } from "../model/display-document.js";
import { gearTolerance } from "./gear-precision.js";
import { gearDefinition } from "./gear-settings.js";
import { type ThreadSettings, threadDefinition, threadSettings } from "./thread-settings.js";
import type { DecoratorInstance } from "./types.js";

export function threadTolerance({ pitch, clearance }: ThreadSettings): number {
  const tolerance = Math.min(0.004, pitch / 200, clearance > 0 ? clearance / 8 : Infinity);
  if (tolerance < 1e-5)
    throw new Error("The requested clearance is below the supported mesh precision");
  return tolerance;
}

/** A geometric sampling budget, independent from the user's intentional fit allowance. */
export function exportTolerance(
  instances: readonly DecoratorInstance[],
  document?: DisplayDocument,
): number {
  let tolerance = 0.004;
  for (const instance of instances) {
    if (instance.definition === gearDefinition && document)
      tolerance = Math.min(tolerance, gearTolerance(document, instance, "export"));
    if (instance.definition !== threadDefinition) continue;
    tolerance = Math.min(tolerance, threadTolerance(threadSettings(instance.settings)));
  }
  return tolerance;
}
