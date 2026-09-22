import type { Bezier, Segment, Sketch } from "./document.js";
import { add, scale, subtract } from "./geometry.js";
import type { Point } from "./planes.js";

export function straightBezier(line: Segment): Bezier {
  const step = scale(subtract(line.b, line.a), 1 / 3);
  return { ...line, kind: "bezier", c1: add(line.a, step), c2: subtract(line.b, step) };
}
export function editBezierHandle(
  sketch: Sketch,
  id: string,
  handle: "c1" | "c2",
  point: Point,
): Sketch {
  return {
    ...sketch,
    curves: sketch.curves.map((c) =>
      c.id === id && c.kind === "bezier" ? { ...c, [handle]: point } : c,
    ),
  };
}
