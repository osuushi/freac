import { closestOnCurve, curveDistance } from "./curve-geometry.js";
import { curveIntersections } from "./curve-intersections.js";
import type { Curve, Segment } from "./document.js";
import type { Point } from "./planes.js";
import { add, distance, scale, subtract } from "./point-math.js";
import { trimChain } from "./trim-chain.js";
import { spanCurve, type TrimSpan, trimSpans } from "./trim-geometry.js";
import { overlappingTrim } from "./trim-overlap.js";

/** A swept circular brush is a capsule in sketch coordinates, independent of tessellation. */
function touches(curve: Curve, a: Point, b: Point, brushRadius: number): boolean {
  const radius = brushRadius + 1e-7;
  if (curveDistance(curve, a) <= radius || curveDistance(curve, b) <= radius) return true;
  const length = distance(a, b);
  if (length < 1e-10) return false;
  const path: Segment = { id: "", kind: "segment", a, b, construction: false };
  if (curve.kind === "circle") {
    const nearest = distance(curve.center, closestOnCurve(path, curve.center)),
      farthest = Math.max(distance(curve.center, a), distance(curve.center, b));
    return Math.max(nearest - curve.radius, curve.radius - farthest, 0) <= radius;
  }
  if ([curve.a, curve.b].some((p) => distance(p, closestOnCurve(path, p)) <= radius)) return true;
  const delta = subtract(b, a),
    offset = scale({ x: -delta.y, y: delta.x }, radius / length);
  return [1, -1].some(
    (side) =>
      curveIntersections(curve, {
        ...path,
        a: add(a, scale(offset, side)),
        b: add(b, scale(offset, side)),
      }).length,
  );
}

export function uniqueTrimSpans(spans: readonly TrimSpan[]): TrimSpan[] {
  const seen = new Set<string>();
  return spans.filter((span) => {
    const key = `${span.curve.id}:${span.start}:${span.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function trimBrushSpans(
  curves: readonly Curve[],
  a: Point,
  b: Point,
  radius: number,
  intersectionsOnly = false,
): TrimSpan[] {
  return uniqueTrimSpans(
    curves.flatMap((curve) =>
      trimSpans(curve, curves, intersectionsOnly)
        .filter((span) => touches(spanCurve(span), a, b, radius))
        .flatMap((span) => (intersectionsOnly ? trimChain(span, curves) : [span])),
    ),
  );
}

/** Include coincident portions that the ordinary trim rewrite will also remove. */
export function trimHighlights(spans: readonly TrimSpan[], curves: readonly Curve[]): TrimSpan[] {
  return uniqueTrimSpans([
    ...spans,
    ...spans.flatMap((span) => {
      const highlight = spanCurve(span);
      return curves.flatMap((curve) => {
        if (curve.id === span.curve.id) return [];
        const overlap = overlappingTrim(curve, highlight);
        return overlap ? [overlap] : [];
      });
    }),
  ]);
}
