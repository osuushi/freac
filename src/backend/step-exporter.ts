import type { StepItem } from "../model/step-export.js";
import { validateStepItems } from "../model/step-export.js";
import { NativeCalculator } from "./native-calculator.js";

/** A cancellable read-only export of a captured snapshot, independent of live edits. */
export class StepExporter extends NativeCalculator<
  { kind: "export-step"; items: readonly StepItem[] },
  { step: string }
> {
  async export(items: readonly StepItem[]): Promise<string> {
    validateStepItems(items);
    const result = await this.calculate({ kind: "export-step", items });
    if (!result.step?.startsWith("ISO-10303-21;")) throw new Error("STEP geometry unavailable");
    return result.step;
  }
}
