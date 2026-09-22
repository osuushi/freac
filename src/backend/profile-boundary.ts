import { bezierSpan } from "../sketch/bezier-geometry.js";
import { type CurveSpan, curvePoint } from "../sketch/curve-spans.js";
import { type PlaneFrame, worldPoint } from "../sketch/planes.js";

const turn = 2 * Math.PI;
function joins(a: CurveSpan, b: CurveSpan): boolean {
  if (a.curve.id !== b.curve.id || a.curve.kind === "segment") return false;
  if (a.curve.kind === "bezier")
    return (
      Math.abs(a.end - b.start) < 1e-9 && Math.sign(a.end - a.start) === Math.sign(b.end - b.start)
    );
  const gap = a.end - b.start;
  return (
    Math.abs(gap - Math.round(gap / turn) * turn) < 1e-9 &&
    Math.sign(a.end - a.start) === Math.sign(b.end - b.start)
  );
}

/** Region traversal cuts are not BRep vertices. Rejoin contiguous pieces of
 * the same circular curve, including across the loop's arbitrary start. */
export function boundary(spans: readonly CurveSpan[], frame: PlaneFrame) {
  const merged: CurveSpan[] = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && joins(last, span)) last.end += span.end - span.start;
    else merged.push({ ...span });
  }
  const first = merged[0],
    last = merged.at(-1);
  if (merged.length > 1 && last && joins(last, first)) {
    first.start -= last.end - last.start;
    merged.pop();
  }
  return merged.map((span) => {
    if (span.curve.kind === "bezier") {
      const c = bezierSpan(span.curve, span.start, span.end);
      return {
        kind: "bezier",
        a: worldPoint(frame, c.a),
        c1: worldPoint(frame, c.c1),
        c2: worldPoint(frame, c.c2),
        b: worldPoint(frame, c.b),
      };
    }
    const at = (t: number) => worldPoint(frame, curvePoint(span.curve, t));
    if (span.curve.kind === "circle" && Math.abs(Math.abs(span.end - span.start) - turn) < 1e-9) {
      const { u, v } = frame;
      const sign = Math.sign(span.end - span.start);
      return {
        kind: "circle",
        center: worldPoint(frame, span.curve.center),
        radius: span.curve.radius,
        normal: [
          sign * (u[1] * v[2] - u[2] * v[1]),
          sign * (u[2] * v[0] - u[0] * v[2]),
          sign * (u[0] * v[1] - u[1] * v[0]),
        ],
        axis: u,
      };
    }
    return span.curve.kind === "segment"
      ? { kind: "line", a: at(span.start), b: at(span.end) }
      : { kind: "arc", a: at(span.start), mid: at((span.start + span.end) / 2), b: at(span.end) };
  });
}
