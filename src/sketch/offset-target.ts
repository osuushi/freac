import {
  type Constraint,
  type Curve,
  newId,
  type PointReference,
  type Sketch,
} from "./document.js";
import { distance } from "./geometry.js";
import { coincidentPoints } from "./line-edit.js";
import { type LoopEdge, orderedLoop } from "./loop-boundary.js";
import { offsetLoop } from "./loop-offset.js";
import { offsetCurve } from "./offset-geometry.js";

export interface OffsetTarget {
  curve: Curve;
  direction: number;
  loop?: LoopEdge[];
}
export function prepareOffset(curves: readonly Curve[]): OffsetTarget {
  if (curves.length === 1) return { curve: curves[0], direction: 1 };
  const loop = orderedLoop(curves),
    curve = loop[0];
  return { curve, loop, direction: curve.kind === "segment" ? -1 : Math.sign(curve.bulge) };
}
export function offsetResult(
  target: OffsetTarget,
  amount: number,
  ids: readonly string[],
): Curve[] {
  return target.loop
    ? offsetLoop(target.loop, amount, ids)
    : [offsetCurve(target.curve, amount, ids[0])];
}

// The offset normalizes edge traversal, so source endpoint names may be reversed.
// Copy connectivity between loop neighbours, including links through a source hub.
export function offsetLinks(
  sketch: Sketch,
  target: OffsetTarget,
  ids: readonly string[],
): Constraint[] {
  const loop = target.loop;
  if (!loop) return [];
  const sourcePoint = (edge: LoopEdge, end: "a" | "b"): PointReference => {
    const source = sketch.curves.find((curve) => curve.id === edge.id);
    if (!source || source.kind === "circle") throw new Error("Missing offset source edge");
    return { curve: edge.id, end: distance(edge[end], source.a) < 1e-7 ? "a" : "b" };
  };
  return loop.flatMap((edge, i) => {
    const next = (i + 1) % loop.length;
    const a = sourcePoint(edge, "b"),
      b = sourcePoint(loop[next], "a");
    if (!coincidentPoints(sketch, a).some((p) => p.curve === b.curve && p.end === b.end)) return [];
    return [
      {
        id: newId(),
        kind: "coincident" as const,
        a: { curve: ids[i], end: "b" as const },
        b: { curve: ids[next], end: "a" as const },
      },
    ];
  });
}
