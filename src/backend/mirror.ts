import type { MirrorOperation } from "../model/mirror.js";
import { type SketchDocument, withSketch } from "../sketch/document.js";
import { continuingBodies, materialize } from "./kernel-result.js";
import { mirrorSketch } from "./mirror-sketch.js";
import type { SolidCalculator } from "./solid-calculator.js";

export async function mirrorDocument(
  document: SketchDocument,
  operation: MirrorOperation,
  kernel: SolidCalculator,
): Promise<SketchDocument> {
  if (typeof operation.keepOriginal !== "boolean")
    throw new Error("Choose whether to keep the original");
  if (operation.kind === "sketch") {
    const sketch = document.sketches.find((s) => s.id === operation.sketchId);
    if (!sketch) throw new Error("Mirror sketch no longer exists");
    return withSketch(document, mirrorSketch(sketch, operation));
  }
  if (operation.kind !== "bodies") throw new Error("Unknown mirror selection");
  const bodies = document.bodies ?? [];
  if (
    !operation.ids.length ||
    new Set(operation.ids).size !== operation.ids.length ||
    operation.ids.some((id) => !bodies.some((b) => b.id === id))
  )
    throw new Error("Select existing bodies to mirror");
  const byId = new Map(bodies.map((b) => [b.id, b]));
  const operands = operation.ids.map((id) => {
    const body = byId.get(id);
    if (!body) throw new Error("Mirror body no longer exists");
    return body;
  });
  const result = await kernel.calculate({ ...operation, kind: "mirror", bodies: operands });
  const reflected = materialize(bodies, result);
  return {
    ...document,
    bodies: operation.keepOriginal ? reflected : continuingBodies(bodies, reflected),
  };
}
