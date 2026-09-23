import { cubicOffsetProfile } from "../sketch/cubic-offset-target.js";
import { curveIntersections } from "../sketch/curve-intersections.js";
import { emptySketch, type SketchDocument, withSketch } from "../sketch/document.js";
import { distance } from "../sketch/geometry.js";
import { hasClosedEndpoints } from "../sketch/loop-boundary.js";
import type { ModelRequest } from "../sketch/model-api.js";
import { planes } from "../sketch/planes.js";
import { profilesFor } from "../sketch/profiles.js";
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
  const profiles = profilesFor({ ...emptySketch(planes.XY), curves: converted });
  const used = new Set(profiles.flatMap((p) => p.outer.map((s) => s.curve.id)));
  const bounded = converted.filter((c) => c.kind !== "circle");
  if (
    (bounded.length > 0 && !hasClosedEndpoints(bounded)) ||
    !profiles.length ||
    profiles.some((p) => p.holes.length) ||
    used.size !== converted.length
  )
    throw new Error("Offset did not produce complete closed sections");
  for (let i = 0; i < converted.length; i++) {
    const a = converted[i];
    for (const b of converted.slice(i + 1)) {
      if (
        curveIntersections(a, b).some(
          (p) =>
            a.kind === "circle" ||
            b.kind === "circle" ||
            ![a.a, a.b].some((q) => distance(p, q) < 1e-7) ||
            ![b.a, b.b].some((q) => distance(p, q) < 1e-7),
        )
      )
        throw new Error("Offset sections cross instead of closing independently");
    }
  }
  const area = profiles.reduce((sum, p) => sum + p.area, 0);
  if (Math.sign(area - source.area) !== Math.sign(request.amount))
    throw new Error("Offset collapses or inverts the loop");
  return withSketch(document, projectedSketch(sketch, converted));
}
