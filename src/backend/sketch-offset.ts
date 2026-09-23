import { cubicOffsetProfile } from "../sketch/cubic-offset-target.js";
import { type SketchDocument, withSketch } from "../sketch/document.js";
import type { ModelRequest } from "../sketch/model-api.js";
import { planes } from "../sketch/planes.js";
import { projectedSketch } from "../sketch/projected-sketch.js";
import { boundary } from "./profile-boundary.js";
import type { SolidCalculator } from "./solid-calculator.js";

export type SketchOffset = Extract<ModelRequest, { kind: "offset-sketch" }>;
export function sketchOffsetInput(document: SketchDocument, request: SketchOffset) {
  const sketch = document.sketches.find((s) => s.id === request.sketchId);
  if (!sketch) throw new Error("Offset sketch no longer exists");
  const curves = sketch.curves.filter((c) => request.curves.includes(c.id));
  if (curves.length !== request.curves.length) throw new Error("Offset source no longer exists");
  if (!Number.isFinite(request.amount) || Math.abs(request.amount) < 1e-7)
    throw new Error("Enter a non-zero offset distance");
  const profile = cubicOffsetProfile(curves);
  return {
    kind: "offset-sketch" as const,
    amount: request.amount,
    curves: boundary(profile.outer, planes.XY),
    frame: planes.XY,
    bodies: [],
  };
}
export async function offsetSketchDocument(
  document: SketchDocument,
  request: SketchOffset,
  kernel: SolidCalculator,
): Promise<SketchDocument> {
  const input = sketchOffsetInput(document, request);
  const result = await kernel.calculate(input);
  if (!result.curves?.length) throw new Error("Offset returned no curves");
  const sketch = document.sketches.find((s) => s.id === request.sketchId);
  if (!sketch) throw new Error("Offset sketch no longer exists");
  const source = cubicOffsetProfile(sketch.curves.filter((c) => request.curves.includes(c.id)));
  const converted = result.curves.map((c, i) => ({ ...c, id: `offset-${i}` }));
  const profile = cubicOffsetProfile(converted);
  if (Math.sign(profile.area - source.area) !== Math.sign(request.amount))
    throw new Error("Offset collapses or inverts the loop");
  return withSketch(document, projectedSketch(sketch, converted));
}
