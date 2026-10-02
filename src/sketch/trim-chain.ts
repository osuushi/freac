import { closestOnCurve } from "./curve-geometry.js";
import type { Curve } from "./document.js";
import { distance } from "./point-math.js";
import { type TrimSpan, trimPoint, trimSpans } from "./trim-geometry.js";

const tolerance = 1e-7;

/** Continue through ordinary degree-two joins, never across a crossing or branch. */
export function trimChain(seed: TrimSpan, curves: readonly Curve[]): TrimSpan[] {
  const result = [seed];
  const visited = new Set([seed.curve.id]);
  const pending = [seed];
  while (pending.length) {
    const span = pending.pop();
    if (!span || span.curve.kind === "circle") continue;
    for (const t of [span.start, span.end]) {
      const point = trimPoint(span.curve, t);
      if (![span.curve.a, span.curve.b].some((p) => distance(point, p) <= tolerance)) continue;
      const touching = curves.filter(
        (c) => c.id !== span.curve.id && distance(point, closestOnCurve(c, point)) <= tolerance,
      );
      if (touching.length !== 1) continue;
      const next = touching[0];
      if (next.kind === "circle" || visited.has(next.id)) continue;
      const end =
        distance(point, next.a) <= tolerance ? 0 : distance(point, next.b) <= tolerance ? 1 : null;
      if (end === null) continue;
      const spans = trimSpans(next, curves, true);
      const continuation = end === 0 ? spans[0] : spans[spans.length - 1];
      visited.add(next.id);
      result.push(continuation);
      pending.push(continuation);
    }
  }
  return result;
}
