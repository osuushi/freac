import { arcCircle } from "./arc-geometry.js";
import { bezierSpan } from "./bezier-geometry.js";
import { closestOnCurve } from "./curve-geometry.js";
import type { Curve } from "./document.js";
import { distance } from "./geometry.js";
import {
  spanCurve,
  type TrimSpan,
  trimParameter,
  trimPoint,
  trimSpanLength,
} from "./trim-geometry.js";

const tolerance = 1e-7;

// Test continuous support, not proximity at the cursor: a crossing is never overlap.
function contained(piece: Curve, highlight: Curve): boolean {
  if (highlight.kind === "bezier") {
    const line = {
      id: highlight.id,
      kind: "segment" as const,
      a: highlight.a,
      b: highlight.b,
      construction: highlight.construction,
    };
    if (
      distance(line.a, line.b) > tolerance &&
      [highlight.c1, highlight.c2].every((p) => distance(p, closestOnCurve(line, p)) <= tolerance)
    )
      return contained(piece, line);
  }
  if (piece.kind === "bezier" && highlight.kind === "bezier") {
    const a = trimParameter(highlight, piece.a),
      b = trimParameter(highlight, piece.b);
    const match = bezierSpan(highlight, a, b);
    return (["a", "c1", "c2", "b"] as const).every(
      (key) => distance(piece[key], match[key]) <= tolerance,
    );
  }
  if (highlight.kind === "segment") {
    const points =
      piece.kind === "segment"
        ? [piece.a, piece.b]
        : piece.kind === "bezier"
          ? [piece.a, piece.c1, piece.c2, piece.b]
          : [];
    return (
      points.length > 0 &&
      points.every((p) => distance(p, closestOnCurve(highlight, p)) <= tolerance)
    );
  }
  if (
    (piece.kind !== "arc" && piece.kind !== "circle") ||
    (highlight.kind !== "arc" && highlight.kind !== "circle")
  )
    return false;
  const a = piece.kind === "arc" ? arcCircle(piece) : piece;
  const b = highlight.kind === "arc" ? arcCircle(highlight) : highlight;
  if (distance(a.center, b.center) > tolerance || Math.abs(a.radius - b.radius) > tolerance)
    return false;
  return [0, 0.25, 0.5, 0.75, 1].every((t) => {
    const p = trimPoint(piece, t);
    return distance(p, closestOnCurve(highlight, p)) <= tolerance;
  });
}

export function overlappingTrim(curve: Curve, highlight: Curve): TrimSpan | null {
  // Only highlight endpoints partition an overlap. Crossing intersections are irrelevant.
  const cuts = curve.kind === "circle" ? [] : [0, 1];
  if (highlight.kind !== "circle") {
    for (const p of [highlight.a, highlight.b]) {
      if (distance(p, closestOnCurve(curve, p)) <= tolerance) cuts.push(trimParameter(curve, p));
    }
  }
  const ordered = cuts.sort((a, b) => a - b).filter((t, i, all) => !i || t - all[i - 1] > 1e-12);
  const spans =
    curve.kind === "circle" && ordered.length < 2
      ? [{ curve, start: 0, end: 1 }]
      : (curve.kind === "circle" ? ordered : ordered.slice(0, -1)).map((start, i) => ({
          curve,
          start,
          end: ordered[i + 1] ?? ordered[0] + 1,
        }));
  return (
    spans.find(
      (span) => trimSpanLength(span) > tolerance && contained(spanCurve(span), highlight),
    ) ?? null
  );
}
