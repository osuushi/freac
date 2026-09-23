import { cubicOffsetProfile } from "./cubic-offset-target.js";
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
  native?: boolean;
}
export function prepareOffset(curves: readonly Curve[]): OffsetTarget {
  if (curves.some((c) => c.kind === "bezier")) {
    const profile = cubicOffsetProfile(curves);
    const span = profile.outer[0];
    const curve = span.curve;
    const direction =
      curve.kind === "segment" || curve.kind === "bezier"
        ? -Math.sign(span.end - span.start)
        : Math.sign(span.end - span.start);
    return { curve, direction, native: true };
  }
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
