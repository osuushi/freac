import type { Arc, Segment, Sketch } from "./document.js";
import { dot, subtract } from "./geometry.js";
import { closedBoundaries } from "./regions.js";

// Signs describe the side of each a→b chord's left normal. Matching signs in
// this map mean matching physical direction, or matching region interior.
const interiors = new WeakMap<Sketch, Map<string, number>>();
function regionSides(sketch: Sketch): Map<string, number> {
  const cached = interiors.get(sketch);
  if (cached) return cached;
  const boundaries = closedBoundaries(sketch.curves);
  const sides = new Map<string, number>();
  for (const curve of sketch.curves) {
    if (curve.kind !== "segment") continue;
    const uses = boundaries
      .map((boundary) => boundary.filter((span) => span.curve.id === curve.id))
      .filter((spans) => spans.length);
    if (uses.length !== 1) continue;
    const spans = uses[0],
      sign = Math.sign(spans[0].end - spans[0].start);
    const coverage = spans.reduce((sum, span) => sum + Math.abs(span.end - span.start), 0);
    if (
      Math.abs(coverage - 1) < 1e-7 &&
      spans.every((span) => Math.sign(span.end - span.start) === sign)
    )
      sides.set(curve.id, sign);
  }
  interiors.set(sketch, sides);
  return sides;
}

export function bowDirections(
  sketch: Sketch,
  curves: readonly (Segment | Arc)[],
): Map<string, number> | null {
  if (curves.length < 2) return new Map(curves.map((c) => [c.id, 1]));
  // Existing arcs already express a side; joint radius editing preserves it.
  if (curves.every((c) => c.kind === "arc"))
    return new Map(curves.map((c) => [c.id, -Math.sign(c.bulge)]));
  if (curves.some((c) => c.kind !== "segment")) return null;
  const reference = subtract(curves[0].b, curves[0].a);
  const parallel = curves.every((curve) => {
    const chord = subtract(curve.b, curve.a);
    return (
      Math.abs(reference.x * chord.y - reference.y * chord.x) <=
      1e-7 * Math.hypot(reference.x, reference.y) * Math.hypot(chord.x, chord.y)
    );
  });
  if (parallel)
    return new Map(curves.map((c) => [c.id, Math.sign(dot(reference, subtract(c.b, c.a)))]));
  const sides = regionSides(sketch);
  return curves.every((c) => sides.has(c.id)) ? sides : null;
}
